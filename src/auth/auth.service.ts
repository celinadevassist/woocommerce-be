import {
  ConflictException,
  Injectable,
  Inject,
  forwardRef,
  InternalServerErrorException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import * as bcrypt from 'bcryptjs';
import { config } from '../config.manager';
import { sign, verify } from 'jsonwebtoken';
import { nanoid } from 'nanoid';

import { RoleService, SMSService, EmailService } from '../services';
import { MailrelayService } from '../services/mailrelay.service';
import { MailerService } from '../services/mailer.service';
import { generateBussinessError } from '../handlers/error-creator';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ImageService } from 'src/services/image.service';
import getUserAttreputes from 'src/services/getUserAttreputes';
import { User, UserDocument } from 'src/schema';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private emailProvider: 'mailrelay' | 'smtp';

  constructor(
    private roleService: RoleService,
    private smsService: SMSService,
    private emailService: EmailService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @Inject(forwardRef(() => ImageService))
    private readonly imageService: ImageService,
    @Inject(forwardRef(() => MailrelayService))
    private readonly mailrelayService: MailrelayService,
    @Inject(forwardRef(() => MailerService))
    private readonly mailerService: MailerService,
    private configService: ConfigService,
  ) {
    // Determine which email provider to use
    this.emailProvider = this.configService.get<string>(
      'EMAIL_PROVIDER',
      'smtp',
    ) as 'mailrelay' | 'smtp';
    this.logger.log(`📧 Email Provider: ${this.emailProvider.toUpperCase()}`);
  }

  async signup(userDTO: any, lang) {
    const user = userDTO;
    // Normalize email to lowercase
    user.email = user.email?.toLowerCase()?.trim();
    let exist = await this.userModel.findOne({ email: user.email });

    if (exist) {
      generateBussinessError('user_already_exist', lang, 409);
    }
    // //create general type role to use the regions and metadata in creating profile data other thsn this will give 403 forbidden
    // user.role = 'user';
    // user.type = 'CLIENT';
    // user.status = 'NEW';
    user.hashKey = await bcrypt.genSalt();
    user.password = await this.encryptPassword(user.password, user.hashKey);
    // user.activateAccountToken = Math.random().toFixed(6).substr(2);
    // user.activateAccountExpires = new Date(Date.now() + 900000);
    // const otbSent = await this.smsService.sendOTP(user.mobile, user.activateAccountToken);
    // user.paymentType = 'CASH';
    // if (!otbSent) {
    //   return generateBussinessError('sms_provide_down', lang, 500);
    // }
    // await this.userModel.create(user);
    // return {
    //   message: lang === 'en' ? `an OTP sent successfully` : lang === 'ar' ? `تم ارسال رسالة تاكيد للهاتف` : '',
    // };
    //generate unique user code to be used in creating his invoice
    // user.UID = await this.metadataService.newUserId()
    // let image = user.image || ""
    // delete user.image
    // console.log(user)

    // Generate email verification token
    user.emailVerificationToken = nanoid(32);
    user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    user.emailVerified = false;

    exist = await this.userModel.create(user);

    // Send verification email
    try {
      if (this.emailProvider === 'smtp') {
        await this.mailerService.sendVerificationEmail(
          exist.email,
          user.emailVerificationToken,
          exist.firstName || exist.email,
        );

        // Also send welcome email
        await this.mailerService.sendWelcomeEmail(
          exist.email,
          exist.firstName || exist.email,
        );
      } else {
        await this.mailrelayService.sendVerificationEmail(
          exist.email,
          user.emailVerificationToken,
          exist.firstName || exist.email,
        );

        // Also send welcome email
        await this.mailrelayService.sendWelcomeEmail(
          exist.email,
          exist.firstName || exist.email,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to send verification email to ${exist.email}:`,
        error,
      );
    }

    // let profileImage = await this.imageService.create_update({ userId: exist._id }, { userId: exist._id, type: "profile", imageUrl: image });
    // exist["image"] = profileImage.imageUrl
    const token = await this.retrieveToken(exist._id, exist.mobile, exist.role);

    // var date = new Date();
    // const validPeriod = 10
    // const randomCode = (Math.random() + 1).toString(36).substring(8);
    // const SMSContent = `Your First Order 10% Discount PROMO CODE:${voucherCode}, Valid For ${validPeriod} Days ONLY`

    // await this.voucherService.create(
    //   {
    //     code: voucherCode,
    //     value: 0.1,
    //     type: "SIGNUP VOUCHER",
    //     userId: exist._id,
    //     validToDate: date.setDate(date.getDate() + validPeriod),
    //     validPeriod: validPeriod,
    //     textSent: SMSContent
    //   }
    // )
    // if (await this.smsService.sendSMS([{ mobile: exist.mobile, message: SMSContent }])) {
    //   await this.SMSLogService.create(
    //     {
    //       to: exist.mobile,
    //       SMSContent: SMSContent,
    //     }
    //   )
    // }

    return {
      token,
      user: getUserAttreputes(exist.toObject()),
    };
  }

  async signin(userDTO, lang): Promise<{ token: string; user: any }> {
    const user = userDTO;
    let exist: any = {};
    // Normalize email to lowercase for case-insensitive matching
    const normalizedEmail = user.email?.toLowerCase()?.trim();
    exist = await this.userModel
      .findOne({ email: normalizedEmail })
      .select('+password +hashKey');

    if (!exist) {
      generateBussinessError('email_not_exist', lang, 401);
    }
    if (!exist.password) {
      generateBussinessError(
        'Click On Forget Your Password, And Create New Password To Your Account',
        lang,
        401,
      );
    }
    // if (exist.status === 'NEW') {
    //   generateBussinessError('phone_need_verification', lang, 409);
    // }

    if (!(await this.validatePassword(exist, user.password))) {
      generateBussinessError('wrong_password', lang, 401);
    }
    const token = await this.retrieveToken(exist._id, exist.mobile, exist.role);

    // const pipeLine: any = [
    //   { $match: { _id: exist._id } },
    //   {
    //     $lookup: {
    //       from: 'servantIn', localField: '_id', foreignField: 'userId',
    //       pipeline: [
    //         {
    //           $lookup: {
    //             from: 'service',
    //             localField: 'serviceId',
    //             foreignField: '_id',
    //             as: 'service'
    //           }
    //         },
    //         { $addFields: { service: { $first: "$service" } } }
    //       ], as: 'servantInData'
    //     }
    //   },
    //   { $addFields: { servantIn: "$servantInData.service" } },
    //   {
    //     $lookup: {
    //       from: 'servedBy', localField: '_id', foreignField: 'userId',
    //       pipeline: [
    //         {
    //           $lookup: {
    //             from: 'class',
    //             localField: 'classId',
    //             foreignField: '_id',
    //             as: 'class'
    //           }
    //         },
    //         { $addFields: { class: { $first: "$class" } } }
    //       ], as: 'servedByData'
    //     }
    //   },
    //   { $addFields: { servedBy: "$servedByData.class" } },
    //   { $project: { servantInData: 0, servedByData: 0, profileImageData: 0 } },
    // ]
    // // get the records
    // exist = await this.userModel.aggregate(pipeLine);

    // await this.smsService.sendSMS([{ mobile: "01273215942", message: "Repeated User" }])
    return { token, user: getUserAttreputes(exist) };
  }

  async forgetPassword(email: string, lang): Promise<{ message: any }> {
    this.logger.log(`🔐 Password reset requested for email: ${email}`);

    const exist = await this.findUserByEmail(email);
    if (!exist) {
      this.logger.warn(`   User not found: ${email}`);
      generateBussinessError('email_not_exist', lang, 401);
    }

    this.logger.log(`   User found: ${exist._id}`);

    // Generate password reset token
    const resetToken = nanoid(32);
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    this.logger.log(
      `   Generated reset token: ${resetToken.substring(0, 10)}...`,
    );
    this.logger.log(`   Token expires at: ${resetExpires.toISOString()}`);

    // Save reset token to user
    await this.userModel.findOneAndUpdate(
      { _id: exist._id },
      {
        $set: {
          resetPasswordToken: resetToken,
          resetPasswordExpires: resetExpires,
        },
      },
      { new: true },
    );

    this.logger.log(`   Reset token saved to database`);

    // Send password reset email
    try {
      this.logger.log(
        `   Calling ${this.emailProvider.toUpperCase()} service to send password reset email...`,
      );

      let emailSent: boolean;
      if (this.emailProvider === 'smtp') {
        this.logger.log('   Using SMTP (MXrouting) email service');
        emailSent = await this.mailerService.sendPasswordResetEmail(
          exist.email,
          resetToken,
          exist.firstName || exist.email,
        );
      } else {
        this.logger.log('   Using Mailrelay API email service');
        emailSent = await this.mailrelayService.sendPasswordResetEmail(
          exist.email,
          resetToken,
          exist.firstName || exist.email,
        );
      }

      this.logger.log(
        `   Email send result: ${emailSent ? '✅ Success' : '❌ Failed'}`,
      );

      return {
        message:
          lang === 'en'
            ? 'Password reset instructions have been sent to your email'
            : lang === 'ar'
            ? 'تم إرسال تعليمات إعادة تعيين كلمة المرور إلى بريدك الإلكتروني'
            : 'Password reset email sent',
      };
    } catch (error) {
      this.logger.error(
        `❌ Failed to send password reset email to ${exist.email}:`,
        error,
      );
      this.logger.error(`   Error details: ${JSON.stringify(error)}`);
      generateBussinessError('email_send_failed', lang, 500);
    }
  }

  async resetPasswordWithToken(
    token: string,
    newPassword: string,
    lang,
  ): Promise<{ message: any }> {
    const exist = await this.userModel.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!exist) {
      generateBussinessError('invalid_or_expired_token', lang, 401);
    }

    // Update password
    const hashKey = await bcrypt.genSalt();
    const password = await this.encryptPassword(newPassword, hashKey);

    await this.userModel.findOneAndUpdate(
      { _id: exist._id },
      {
        $set: {
          password,
          hashKey,
          resetPasswordToken: undefined,
          resetPasswordExpires: undefined,
        },
      },
      { new: true },
    );

    return {
      message:
        lang === 'en'
          ? 'Password updated successfully'
          : lang === 'ar'
          ? 'تم تحديث كلمة المرور بنجاح'
          : 'Password updated',
    };
  }

  async verifyEmail(token: string, lang): Promise<{ message: any }> {
    const exist = await this.userModel.findOne({
      emailVerificationToken: token,
      emailVerificationExpires: { $gt: new Date() },
    });

    if (!exist) {
      generateBussinessError('invalid_or_expired_token', lang, 401);
    }

    await this.userModel.findOneAndUpdate(
      { _id: exist._id },
      {
        $set: {
          emailVerified: true,
          emailVerificationToken: undefined,
          emailVerificationExpires: undefined,
        },
      },
      { new: true },
    );

    return {
      message:
        lang === 'en'
          ? 'Email verified successfully'
          : lang === 'ar'
          ? 'تم التحقق من البريد الإلكتروني بنجاح'
          : 'Email verified',
    };
  }

  async resendVerificationEmail(
    userId: string,
    lang,
  ): Promise<{ message: any }> {
    const exist = await this.userModel.findById(userId);

    if (!exist) {
      generateBussinessError('user_not_found', lang, 404);
    }

    if (exist.emailVerified) {
      return {
        message:
          lang === 'en'
            ? 'Email is already verified'
            : lang === 'ar'
            ? 'تم التحقق من البريد الإلكتروني بالفعل'
            : 'Email already verified',
      };
    }

    // Generate new verification token
    const verificationToken = nanoid(32);
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await this.userModel.findOneAndUpdate(
      { _id: exist._id },
      {
        $set: {
          emailVerificationToken: verificationToken,
          emailVerificationExpires: verificationExpires,
        },
      },
      { new: true },
    );

    // Send verification email
    try {
      await this.mailrelayService.sendVerificationEmail(
        exist.email,
        verificationToken,
        exist.firstName || exist.email,
      );

      return {
        message:
          lang === 'en'
            ? 'Verification email has been resent'
            : lang === 'ar'
            ? 'تم إعادة إرسال بريد التحقق'
            : 'Verification email resent',
      };
    } catch (error) {
      this.logger.error(
        `Failed to resend verification email to ${exist.email}:`,
        error,
      );
      generateBussinessError('email_send_failed', lang, 500);
    }
  }

  async getCredentialsById(userId: string): Promise<any> {
    const exist = await this.userModel.findById(userId);

    const randomPassword = Math.random().toFixed(6).substring(2);
    exist.hashKey = await bcrypt.genSalt();

    exist.password = await this.encryptPassword(randomPassword, exist.hashKey);

    await this.userModel.findOneAndUpdate(
      { _id: exist._id },
      { $set: exist },
      { new: true },
    );
    // const otbSent = await this.smsService.sendOTP(exist.mobile, randomPassword);
    return randomPassword;
  }

  async changePassword(data, creator, lang): Promise<{ message: any }> {
    const exist = await this.findUserExistance(creator._id);
    if (!exist) {
      generateBussinessError('email_not_exist', lang, 401);
    }
    const hashKey = await bcrypt.genSalt();
    const password = await this.encryptPassword(data.newPassword, hashKey);
    await this.userModel.findOneAndUpdate(
      { _id: exist._id },
      { $set: { password, hashKey } },
      { new: true },
    );
    return {
      message:
        lang === 'en'
          ? `Password updated successfully`
          : lang === 'ar'
          ? `تم تغير كلمة المرور`
          : '',
    };
  }

  // async resetPassword(userDTO, lang): Promise<{ message: any, token: string, user: any }> {
  //   console.log(userDTO);

  //   let exist = await this.userModel.findOne(
  //     { mobile: userDTO.mobile },
  //   );
  //   if (!exist) {
  //     generateBussinessError('email_not_exist', lang, 401);
  //   }
  //   console.log("mobile exist");

  //   if (!exist.resetPasswordToken || userDTO.otp !== exist.resetPasswordToken
  //     || !exist.resetPasswordExpires || exist.resetPasswordExpires <= new Date()
  //   ) {
  //     generateBussinessError('opt_worong_or_expired', lang, 401);
  //   }

  //   const hashKey = await bcrypt.genSalt();
  //   const password = await this.encryptPassword(userDTO.newPassword, hashKey);

  //   exist = await this.userModel.findOneAndUpdate(
  //     { mobile: userDTO.mobile, resetPasswordToken: userDTO.otp },
  //     { $set: { password, hashKey, resetPasswordToken: undefined, resetPasswordExpires: undefined } }
  //     , { new: true }
  //   );

  //   const token = await this.retrieveToken(
  //     exist._id, exist.mobile, exist.role,
  //   );
  //   return {
  //     message: lang === 'en' ? 'Password updated successfully' : lang === 'ar' ? 'تم تعديل كلمة المرور بنجاح' : '',
  //     token, user: getUserAttreputes(exist.toObject())
  //   };
  // }

  // async activateAcount(userDTO, lang): Promise<{ message: any, token: string, user: any }> {
  //   const exist = await this.userModel.findOne(
  //     { mobile: userDTO.mobile, status: 'NEW' },
  //   );
  //   if (
  //     !exist || !exist.activateAccountToken || exist.activateAccountToken !== userDTO.otp ||
  //     !exist.activateAccountExpires || exist.activateAccountExpires <= new Date()
  //   ) {
  //     generateBussinessError('opt_worong_or_expired', lang, 401);
  //   }
  //   if (!exist) {
  //     generateBussinessError('email_not_exist', lang, 401);
  //   }

  //   await this.userModel.findOneAndUpdate(
  //     { mobile: userDTO.mobile, activateAccountToken: userDTO.otp, status: 'NEW' },
  //     { $set: { status: 'INFO_PENDING', activateAccountToken: undefined, activateAccountExpires: undefined } }
  //     , { new: true });
  //   const token = await this.retrieveToken(exist._id, exist.mobile, exist.role,);
  //   return {
  //     message: lang === 'en' ? 'successfully activated' : lang === 'ar' ? 'تم التفعيل بنجاح' : '',
  //     token, user: getUserAttreputes(exist.toObject())
  //   };

  // }

  // ----------------------------------------------------------------------------------//

  async findUserExistance(id): Promise<UserDocument> {
    return await this.userModel.findById(id);
  }

  async findUserByEmail(email: string): Promise<UserDocument> {
    const normalizedEmail = email?.toLowerCase()?.trim();
    return await this.userModel.findOne({ email: normalizedEmail });
  }

  async encryptPassword(password: string, key: string): Promise<string> {
    return await bcrypt.hash(password, key);
  }

  async verify(token, isWs) {
    token = token?.split(' ')[1];
    try {
      if (!token) {
        return false;
      }
      const payload: any = verify(
        token,
        process.env.JWT_SECRET || config.jwt.secret,
      );
      const user = await this.findUserExistance(payload.customer.id);
      if (!user) {
        return false;
      }
      return user;
    } catch (err) {
      return false;
    }
  }

  async retrieveToken(id, mobile, role) {
    const token: string = sign(
      {
        customer: {
          id,
          mobile,
        },
        role,
      },
      process.env.JWT_SECRET || config.jwt.secret,
      {
        // expiresIn: process.env.JWT_EXPIRATION || config.jwt.expiration,
      },
    );
    return token;
  }

  async validatePassword(user: UserDocument, password): Promise<boolean> {
    const requestedPassword = await this.encryptPassword(
      password,
      user.hashKey,
    );
    return (
      requestedPassword === user.password ||
      (await this.validateAndUpdateNewPassword(user, requestedPassword))
    );
  }

  async validateAndUpdateNewPassword(
    user,
    requestedPassword,
  ): Promise<boolean> {
    if (requestedPassword === user.newPassword) {
      user.password = user.newPassword;
      delete user.newPassword;
      this.userModel.findOneAndUpdate(
        { _id: user._id },
        { $set: user },
        { new: true },
      );
    }
    return requestedPassword === user.newPassword;
  }
}
