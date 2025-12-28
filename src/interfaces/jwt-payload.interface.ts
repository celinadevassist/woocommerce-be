export interface IJWTPayload {
  customer: {
    id: string;
  };
  iat?: number;
  exp?: number;
}
