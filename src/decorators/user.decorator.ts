import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const User = createParamDecorator((data: string, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest();
    
    // If user doesn't exist in the request, return null
    if (!req.user) {
        return null;
    }
    
    try {
        const user = JSON.parse(JSON.stringify(req.user));
        return data ? user && user[data] : user;
    } catch (error) {
        console.error('Error processing user in decorator:', error);
        return null;
    }
});