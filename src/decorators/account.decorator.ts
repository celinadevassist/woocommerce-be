import { createParamDecorator } from '@nestjs/common';

export const Account = createParamDecorator((data: string, ctx) => {
  const req = ctx.switchToHttp().getRequest();
  const account = JSON.parse(JSON.stringify(req.account));
  return data ? account && account[data] : account;
});
