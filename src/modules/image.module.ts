import { forwardRef, Module } from '@nestjs/common';
import { ImageMongoSchema } from '../schema';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { ImageService } from 'src/services/image.service';
import { HttpModule } from '@nestjs/axios/dist';



@Module({
    imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        MongooseModule.forFeature([{ name: 'Image', schema: ImageMongoSchema }]),
        HttpModule,
    ],
    providers: [ImageService],
    exports: [ImageService,],
})
export class ImageModule { }
