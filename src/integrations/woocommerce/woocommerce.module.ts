import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { WooCommerceService } from './woocommerce.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
  ],
  providers: [WooCommerceService],
  exports: [WooCommerceService],
})
export class WooCommerceModule {}
