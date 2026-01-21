// Shipping interfaces for internal use

export interface IShippingZone {
  id: number;
  name: string;
  order: number;
  locations?: IShippingZoneLocation[];
  methods?: IShippingZoneMethod[];
}

export interface IShippingZoneLocation {
  code: string;
  type: 'postcode' | 'state' | 'country' | 'continent';
}

export interface IShippingZoneMethod {
  instanceId: number;
  title: string;
  order: number;
  enabled: boolean;
  methodId: string;
  methodTitle: string;
  methodDescription: string;
  settings: IShippingMethodSettings;
}

export interface IShippingMethodSettings {
  title?: string;
  taxStatus?: string;
  cost?: string;
  minAmount?: string;
  requires?: string;
  ignoreDiscounts?: string;
  [key: string]: string | undefined;
}

export interface IShippingMethod {
  id: string;
  title: string;
  description: string;
}
