import * as Joi from 'joi';
import { LangEnum } from '../enums';

export const LanguageSchema = Joi.string().valid(...Object.keys(LangEnum));
