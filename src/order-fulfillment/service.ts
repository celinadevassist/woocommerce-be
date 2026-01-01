import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Order, OrderDocument } from '../order/schema';
import { ProductUnit, ProductUnitDocument } from '../product-unit/schema';
import { ProductUnitStatus } from '../product-unit/enum';
import { FulfillmentStatus } from '../order/enum';
import {
  IFulfillmentStatus,
  ILineItemSuggestion,
  ISuggestedUnit,
  IScanResult,
  ICompletionResult,
} from './interface';

@Injectable()
export class OrderFulfillmentService {
  constructor(
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    @InjectModel(ProductUnit.name) private productUnitModel: Model<ProductUnitDocument>,
  ) {}

  /**
   * Get fulfillment status and suggestions for an order
   */
  async getFulfillmentStatus(orderId: string): Promise<IFulfillmentStatus> {
    const order = await this.orderModel.findById(orderId);
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const lineItemSuggestions: ILineItemSuggestion[] = [];
    let totalQuantity = 0;
    let fulfilledQuantity = 0;

    for (let i = 0; i < order.lineItems.length; i++) {
      const lineItem = order.lineItems[i];
      totalQuantity += lineItem.quantity;
      fulfilledQuantity += lineItem.fulfilledQuantity || 0;

      // Get fulfilled units for this line item
      const fulfilledUnits = lineItem.fulfilledUnits?.length
        ? await this.productUnitModel.find({
            _id: { $in: lineItem.fulfilledUnits },
          })
        : [];

      // Get suggested units (FIFO - oldest first based on production date)
      const pendingQuantity = lineItem.quantity - (lineItem.fulfilledQuantity || 0);
      let suggestedUnits: ISuggestedUnit[] = [];

      if (pendingQuantity > 0 && lineItem.sku) {
        const available = await this.productUnitModel
          .find({
            storeId: order.storeId,
            sku: lineItem.sku,
            status: ProductUnitStatus.IN_STOCK,
            isDeleted: false,
          })
          .sort({ productionDate: 1, createdAt: 1 })
          .limit(pendingQuantity);

        suggestedUnits = available.map((u) => this.mapToSuggestedUnit(u));
      }

      lineItemSuggestions.push({
        lineItemIndex: i,
        externalId: lineItem.externalId,
        name: lineItem.name,
        sku: lineItem.sku || '',
        quantityNeeded: lineItem.quantity,
        quantityFulfilled: lineItem.fulfilledQuantity || 0,
        quantityPending: pendingQuantity,
        suggestedUnits,
        fulfilledUnits: fulfilledUnits.map((u) => this.mapToSuggestedUnit(u)),
        isComplete: pendingQuantity === 0,
      });
    }

    // Calculate overall status
    let status: 'unfulfilled' | 'partially_fulfilled' | 'fulfilled' = 'unfulfilled';
    if (fulfilledQuantity >= totalQuantity) {
      status = 'fulfilled';
    } else if (fulfilledQuantity > 0) {
      status = 'partially_fulfilled';
    }

    return {
      orderId: order._id as Types.ObjectId,
      orderNumber: order.orderNumber,
      status,
      totalItems: order.lineItems.length,
      fulfilledItems: lineItemSuggestions.filter((li) => li.isComplete).length,
      totalQuantity,
      fulfilledQuantity,
      lineItems: lineItemSuggestions,
    };
  }

  /**
   * Assign specific units to a line item
   */
  async assignUnits(
    userId: string,
    orderId: string,
    lineItemIndex: number,
    unitIds: string[],
  ): Promise<IFulfillmentStatus> {
    const order = await this.orderModel.findById(orderId);
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (lineItemIndex < 0 || lineItemIndex >= order.lineItems.length) {
      throw new BadRequestException('Invalid line item index');
    }

    const lineItem = order.lineItems[lineItemIndex];
    const currentFulfilled = lineItem.fulfilledQuantity || 0;
    const remaining = lineItem.quantity - currentFulfilled;

    if (unitIds.length > remaining) {
      throw new BadRequestException(
        `Cannot assign ${unitIds.length} units. Only ${remaining} more needed.`,
      );
    }

    // Verify all units are available
    const units = await this.productUnitModel.find({
      _id: { $in: unitIds.map((id) => new Types.ObjectId(id)) },
      storeId: order.storeId,
      status: ProductUnitStatus.IN_STOCK,
      isDeleted: false,
    });

    if (units.length !== unitIds.length) {
      throw new BadRequestException('Some units are not available for fulfillment');
    }

    // Verify SKU matches
    for (const unit of units) {
      if (lineItem.sku && unit.sku !== lineItem.sku) {
        throw new BadRequestException(
          `Unit ${unit.rfidCode} has SKU ${unit.sku} but line item requires ${lineItem.sku}`,
        );
      }
    }

    // Mark units as sold immediately (no intermediate reservation state)
    await this.productUnitModel.updateMany(
      { _id: { $in: units.map((u) => u._id) } },
      {
        $set: {
          status: ProductUnitStatus.SOLD,
          orderId: order._id,
          orderNumber: order.orderNumber,
          soldAt: new Date(),
        },
      },
    );

    // Update line item
    const existingUnitIds = (lineItem.fulfilledUnits || []).map((id) => id.toString());
    const newUnitIds = units.map((u) => u._id);
    const allUnitIds = [
      ...existingUnitIds.map((id) => new Types.ObjectId(id)),
      ...newUnitIds,
    ];

    await this.orderModel.updateOne(
      { _id: order._id },
      {
        $set: {
          [`lineItems.${lineItemIndex}.fulfilledUnits`]: allUnitIds,
          [`lineItems.${lineItemIndex}.fulfilledQuantity`]: currentFulfilled + units.length,
        },
      },
    );

    // Update order fulfillment status
    await this.updateOrderFulfillmentStatus(orderId);

    return this.getFulfillmentStatus(orderId);
  }

  /**
   * Scan RFID and auto-assign to appropriate line item
   */
  async scanRfid(orderId: string, rfidCode: string): Promise<IScanResult> {
    const order = await this.orderModel.findById(orderId);
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Find the unit
    const unit = await this.productUnitModel.findOne({
      storeId: order.storeId,
      rfidCode,
      isDeleted: false,
    });

    if (!unit) {
      return {
        success: false,
        message: 'Unit not found with this RFID code',
      };
    }

    if (unit.status !== ProductUnitStatus.IN_STOCK) {
      return {
        success: false,
        message: `Unit is not available (status: ${unit.status})`,
        unit: this.mapToSuggestedUnit(unit),
      };
    }

    // Find matching line item that needs fulfillment
    let matchingLineItemIndex = -1;
    for (let i = 0; i < order.lineItems.length; i++) {
      const lineItem = order.lineItems[i];
      const pending = lineItem.quantity - (lineItem.fulfilledQuantity || 0);
      if (lineItem.sku === unit.sku && pending > 0) {
        matchingLineItemIndex = i;
        break;
      }
    }

    if (matchingLineItemIndex === -1) {
      return {
        success: false,
        message: `No line item in this order requires SKU ${unit.sku}`,
        unit: this.mapToSuggestedUnit(unit),
      };
    }

    // Assign the unit
    await this.assignUnits(
      'system', // System-triggered assignment
      orderId,
      matchingLineItemIndex,
      [unit._id.toString()],
    );

    return {
      success: true,
      message: 'Unit assigned successfully',
      unit: this.mapToSuggestedUnit(unit),
      assignedToLineItem: matchingLineItemIndex,
      lineItemName: order.lineItems[matchingLineItemIndex].name,
    };
  }

  /**
   * Remove a unit from fulfillment (release reservation)
   */
  async removeUnit(
    userId: string,
    orderId: string,
    unitId: string,
  ): Promise<IFulfillmentStatus> {
    const order = await this.orderModel.findById(orderId);
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const unitIdStr = unitId;

    // Find which line item contains this unit
    let foundLineItemIndex = -1;
    for (let i = 0; i < order.lineItems.length; i++) {
      const lineItem = order.lineItems[i];
      const hasUnit = lineItem.fulfilledUnits?.some(
        (id) => id.toString() === unitIdStr,
      );
      if (hasUnit) {
        foundLineItemIndex = i;
        break;
      }
    }

    if (foundLineItemIndex === -1) {
      throw new BadRequestException('Unit is not assigned to any line item in this order');
    }

    const lineItem = order.lineItems[foundLineItemIndex];

    // Return the unit to stock (reverse the sale)
    await this.productUnitModel.updateOne(
      { _id: new Types.ObjectId(unitId) },
      {
        $set: {
          status: ProductUnitStatus.IN_STOCK,
        },
        $unset: {
          orderId: 1,
          orderNumber: 1,
          soldAt: 1,
        },
      },
    );

    // Update line item
    const newFulfilledUnits = (lineItem.fulfilledUnits || []).filter(
      (id) => id.toString() !== unitIdStr,
    );

    await this.orderModel.updateOne(
      { _id: order._id },
      {
        $set: {
          [`lineItems.${foundLineItemIndex}.fulfilledUnits`]: newFulfilledUnits,
          [`lineItems.${foundLineItemIndex}.fulfilledQuantity`]: Math.max(
            0,
            (lineItem.fulfilledQuantity || 0) - 1,
          ),
        },
      },
    );

    // Update order fulfillment status
    await this.updateOrderFulfillmentStatus(orderId);

    return this.getFulfillmentStatus(orderId);
  }

  /**
   * Complete fulfillment - mark all assigned units as sold
   */
  async completeFulfillment(
    userId: string,
    orderId: string,
    notes?: string,
  ): Promise<ICompletionResult> {
    const order = await this.orderModel.findById(orderId);
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Collect all fulfilled unit IDs
    const allFulfilledUnitIds: Types.ObjectId[] = [];
    for (const lineItem of order.lineItems) {
      if (lineItem.fulfilledUnits?.length) {
        for (const unitId of lineItem.fulfilledUnits) {
          allFulfilledUnitIds.push(new Types.ObjectId(unitId.toString()));
        }
      }
    }

    if (allFulfilledUnitIds.length === 0) {
      throw new BadRequestException('No units have been assigned for fulfillment');
    }

    // Mark all units as sold
    await this.productUnitModel.updateMany(
      { _id: { $in: allFulfilledUnitIds } },
      {
        $set: {
          status: ProductUnitStatus.SOLD,
          soldAt: new Date(),
          notes: notes || undefined,
        },
      },
    );

    // Update order fulfillment status
    await this.orderModel.updateOne(
      { _id: order._id },
      {
        $set: {
          fulfillmentStatus: FulfillmentStatus.FULFILLED,
        },
      },
    );

    return {
      success: true,
      orderNumber: order.orderNumber,
      totalUnitsMarkedAsSold: allFulfilledUnitIds.length,
      newFulfillmentStatus: FulfillmentStatus.FULFILLED,
    };
  }

  /**
   * Auto-suggest units for all line items (FIFO)
   */
  async autoSuggestAll(orderId: string): Promise<IFulfillmentStatus> {
    // This just returns the current status with suggestions
    // Actual assignment is done via assignUnits
    return this.getFulfillmentStatus(orderId);
  }

  /**
   * Auto-assign all suggested units (one-click fulfillment)
   */
  async autoAssignAll(userId: string, orderId: string): Promise<IFulfillmentStatus> {
    const status = await this.getFulfillmentStatus(orderId);

    for (const lineItem of status.lineItems) {
      if (lineItem.suggestedUnits.length > 0) {
        const unitIds = lineItem.suggestedUnits.map((u) => u._id.toString());
        await this.assignUnits(userId, orderId, lineItem.lineItemIndex, unitIds);
      }
    }

    return this.getFulfillmentStatus(orderId);
  }

  /**
   * Helper: Update order fulfillment status based on line items
   */
  private async updateOrderFulfillmentStatus(orderId: string): Promise<void> {
    const order = await this.orderModel.findById(orderId);
    if (!order) return;

    let totalQuantity = 0;
    let fulfilledQuantity = 0;

    for (const lineItem of order.lineItems) {
      totalQuantity += lineItem.quantity;
      fulfilledQuantity += lineItem.fulfilledQuantity || 0;
    }

    let newStatus: FulfillmentStatus;
    if (fulfilledQuantity >= totalQuantity) {
      newStatus = FulfillmentStatus.FULFILLED;
    } else if (fulfilledQuantity > 0) {
      newStatus = FulfillmentStatus.PARTIALLY_FULFILLED;
    } else {
      newStatus = FulfillmentStatus.UNFULFILLED;
    }

    await this.orderModel.updateOne(
      { _id: order._id },
      { $set: { fulfillmentStatus: newStatus } },
    );
  }

  /**
   * Helper: Map ProductUnit document to ISuggestedUnit
   */
  private mapToSuggestedUnit(unit: ProductUnitDocument): ISuggestedUnit {
    return {
      _id: unit._id as Types.ObjectId,
      rfidCode: unit.rfidCode,
      sku: unit.sku,
      productName: unit.productName,
      batchId: new Types.ObjectId(unit.batchId.toString()),
      batchNumber: unit.batchNumber,
      unitCost: unit.unitCost,
      productionDate: unit.productionDate,
      location: unit.location,
    };
  }
}
