export enum ReviewRequestStatus {
  PENDING = 'pending',      // Created, waiting to be sent
  SENT = 'sent',            // SMS/WhatsApp sent
  OPENED = 'opened',        // Customer opened the link
  PARTIAL = 'partial',      // Some items reviewed
  COMPLETED = 'completed',  // All items reviewed
  EXPIRED = 'expired',      // Link expired
}

export enum ReviewRequestChannel {
  SMS = 'sms',
  WHATSAPP = 'whatsapp',
  EMAIL = 'email',
}

export enum ReviewRequestTrigger {
  DELIVERED = 'delivered',
  COMPLETED = 'completed',
}
