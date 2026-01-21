import { Injectable, InternalServerErrorException } from '@nestjs/common';
import axios from 'axios';
import { async } from 'rxjs';
import { LoggerService } from '../logger/logger.service';
@Injectable()
export class SMSService {
  OTPservices = [];
  SMSservices = [];
  logger;
  constructor(logger: LoggerService) {
    this.logger = logger;

    (this.OTPservices = [
      { name: 'SMS Misr', handler: this.OTP_SMSMisr, this: this },
      // { name: 'SMS VictoryLink', handler: this.OTP_VictoryLink, this: this },
    ]),
      (this.SMSservices = [
        { name: 'SMS Misr', handler: this.SMS_SMSMisr, this: this },
        // { name: 'SMS VictoryLink', handler: this.SMS_VictoryLink, this: this },
      ]);
  }
  async sendOTP(mobile, code): Promise<boolean> {
    for (const service of this.OTPservices) {
      try {
        const response = await service.handler(mobile, code);
        if (response == true) {
          return true;
        } else {
          service.this.logger.error(response);
        }
      } catch (e) {
        service.this.logger.error(service.name + ' -> ' + JSON.stringify(e));
      }
    }
    return false;
  }

  async sendSMS(data): Promise<boolean> {
    for (const service of this.SMSservices) {
      try {
        const response = await service.handler(data);
        if (response == true) {
          return true;
        } else {
          service.this.logger.error(response);
        }
      } catch (e) {
        service.this.logger.error(service.name + ' -> ' + JSON.stringify(e));
      }
    }
    return false;
  }

  async OTP_SMSMisr(mobile, code): Promise<any> {
    const res = await axios.post('https://smsmisr.com/api/OTP/', null, {
      params: {
        username: 'NbMkEaU5',
        password:
          '61221e8ae3071cbb03943685bc78a0bd1372bc33da6adfb15bb5d4e7fd59a24f',
        template:
          '3c37cb381ffcc7c0254a0d9373afaa265921ba495ad942de6c7b6f4f8bb56847',
        sender:
          '103168b5d60319a4128c6de414ea3427d13d949229766571370d3b332549f77c',
        mobile: mobile,
        otp: code,
        environment: '1',
      },
    });
    //if error send me error to the spreadsheet
    const response = res.data.code;
    if (response == 4901) {
      //respose 4901 in OTP and 1901 in SMS
      return true;
    } else {
      return 'SMS Misr -> responseCode: ' + response;
    }
    //return res?.data?.SMSID;
    //if error send me error to the spreadsheet
  }

  async OTP_VictoryLink(mobile, code): Promise<any> {
    //convert xml response to json npm install xml2js
    const xml2js = require('xml2js').parseString;
    let response;
    const res = await axios.get(
      'https://smsvas.vlserv.com/KannelSending/service.asmx/SendSMS',
      {
        params: {
          username: 'DAP',
          password: 'psdPQ990O9',
          SMSLang: 'a',
          SMSSender: 'DAP',
          SMSReceiver: mobile,
          SMSText: 'كود التفعيل الخاص بك هو :	' + code + ' ',
        },
      },
    );

    xml2js(res.data, function (err, result) {
      if (err) {
        response = err;
      } else {
        const responseCode = result.int._;
        if (responseCode == 0) {
          response = true;
        } else {
          //send me error to the spreadsheet
          response = responseCode;
        }
      }
    });
    return response;
  }

  async SMS_SMSMisr(data): Promise<any> {
    // data is array of {phone, message}
    for (let i = 0; i < data.length; i++) {
      const lang = data[i]?.lang === 'ar' ? 2 : 1;
      const res = await axios.post('https://smsmisr.com/api/SMS/', null, {
        params: {
          username: '2bMLry7t',
          password:
            'd7fb63c154a875ad0556ecb540853dcc5b86824737bba25efcf8991ff4fa7a20',
          language: lang,
          sender:
            'ce506b51c5264dc8345872e7de024383f582a79d8e1f5d32a1342c65bd471566',
          mobile: data[i].phone,
          message: data[i].message,
          environment: '1',
        },
      });
      //if error send me error to the spreadsheet
      const response = res.data.code;
      if (response == 1901) {
        //respose 4901 in OTP and 1901 in SMS
        return true;
      } else {
        return 'SMS Misr -> responseCode: ' + response;
      }
    }
  }

  async SMS_VictoryLink(data): Promise<any> {
    //convert xml response to json npm install xml2js
    const xml2js = require('xml2js').parseString;
    let response;
    for (let i = 0; i < data.length; i++) {
      const res = await axios.get(
        'https://smsvas.vlserv.com/KannelSending/service.asmx/SendSMS',
        {
          params: {
            username: 'DAP',
            password: 'psdPQ990O9',
            SMSLang: 'a',
            SMSSender: 'DAP',
            SMSReceiver: data[i].phone,
            SMSText: data[i].message,
          },
        },
      );

      xml2js(res.data, function (err, result) {
        if (err) {
          response = err;
        } else {
          const responseCode = result.int._;
          if (responseCode == 0) {
            response = true;
          } else {
            //send me error to the spreadsheet
            response = responseCode;
          }
        }
      });
      return response;
    }
  }
}
