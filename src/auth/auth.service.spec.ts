import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { User } from '../schema';
import { RoleService } from '../services/roles.service';
import { SMSService } from '../services/sms.service';
import { EmailService } from '../services/email.service';
import { ImageService } from '../services/image.service';
import { MailrelayService } from '../services/mailrelay.service';
import { MailerService } from '../services/mailer.service';
import * as bcrypt from 'bcryptjs';

// Mock all external services
const mockUserModel = {
  findOne: jest.fn(),
  findById: jest.fn(),
  findOneAndUpdate: jest.fn(),
  create: jest.fn(),
};

const mockRoleService = { findByName: jest.fn() };
const mockSMSService = { sendOTP: jest.fn(), sendSMS: jest.fn() };
const mockEmailService = { sendEmail: jest.fn() };
const mockImageService = { create_update: jest.fn() };
const mockMailrelayService = {
  sendVerificationEmail: jest.fn(),
  sendWelcomeEmail: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
};
const mockMailerService = {
  sendVerificationEmail: jest.fn(),
  sendWelcomeEmail: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
};
const mockConfigService = {
  get: jest.fn().mockReturnValue('smtp'),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getModelToken(User.name), useValue: mockUserModel },
        { provide: RoleService, useValue: mockRoleService },
        { provide: SMSService, useValue: mockSMSService },
        { provide: EmailService, useValue: mockEmailService },
        { provide: ImageService, useValue: mockImageService },
        { provide: MailrelayService, useValue: mockMailrelayService },
        { provide: MailerService, useValue: mockMailerService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  describe('signin', () => {
    it('should throw ResourceNotFoundException when user not found', async () => {
      mockUserModel.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.signin({ email: 'nonexistent@test.com', password: 'pass' }, 'en'),
      ).rejects.toThrow();
    });

    it('should throw ValidationException when user has no password', async () => {
      mockUserModel.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue({
          _id: 'user1',
          email: 'test@test.com',
          password: null,
          hashKey: 'key',
        }),
      });

      await expect(
        service.signin({ email: 'test@test.com', password: 'pass' }, 'en'),
      ).rejects.toThrow();
    });

    it('should throw AuthenticationFailedException for wrong password', async () => {
      const hashKey = await bcrypt.genSalt();
      const password = await bcrypt.hash('correct', hashKey);

      mockUserModel.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue({
          _id: 'user1',
          email: 'test@test.com',
          password,
          hashKey,
          mobile: '123',
          role: 'user',
        }),
      });

      await expect(
        service.signin({ email: 'test@test.com', password: 'wrong' }, 'en'),
      ).rejects.toThrow();
    });

    it('should return token and user on successful signin', async () => {
      const hashKey = await bcrypt.genSalt();
      const password = await bcrypt.hash('correct', hashKey);

      const mockUser = {
        _id: 'user1',
        email: 'test@test.com',
        password,
        hashKey,
        mobile: '123',
        role: 'user',
        firstName: 'Test',
        lastName: 'User',
        toObject: function () { return this; },
      };

      mockUserModel.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUser),
      });

      const result = await service.signin(
        { email: 'test@test.com', password: 'correct' },
        'en',
      );

      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('user');
      expect(result.token).toBeTruthy();
    });

    it('should normalize email to lowercase', async () => {
      mockUserModel.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(null),
      });

      try {
        await service.signin(
          { email: '  TEST@Test.COM  ', password: 'pass' },
          'en',
        );
      } catch {
        // Expected to throw
      }

      const findOneCall = mockUserModel.findOne.mock.calls[0][0];
      expect(findOneCall.email).toBe('test@test.com');
    });
  });

  describe('findUserByEmail', () => {
    it('should normalize email to lowercase', async () => {
      mockUserModel.findOne.mockResolvedValue(null);

      await service.findUserByEmail('TEST@Test.COM');

      expect(mockUserModel.findOne).toHaveBeenCalledWith({
        email: 'test@test.com',
      });
    });

    it('should return user when found', async () => {
      const mockUser = { _id: 'user1', email: 'test@test.com' };
      mockUserModel.findOne.mockResolvedValue(mockUser);

      const result = await service.findUserByEmail('test@test.com');
      expect(result).toEqual(mockUser);
    });
  });

  describe('encryptPassword', () => {
    it('should hash password with given key', async () => {
      const key = await bcrypt.genSalt();
      const result = await service.encryptPassword('password123', key);

      expect(result).toBeTruthy();
      expect(result).not.toBe('password123');
      expect(await bcrypt.compare('password123', result)).toBe(true);
    });

    it('should produce different hashes for different passwords', async () => {
      const key = await bcrypt.genSalt();
      const hash1 = await service.encryptPassword('password1', key);
      const hash2 = await service.encryptPassword('password2', key);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('validatePassword', () => {
    it('should return true for correct password', async () => {
      const hashKey = await bcrypt.genSalt();
      const password = await bcrypt.hash('correct', hashKey);

      const user = { _id: 'user1', password, hashKey } as any;
      const result = await service.validatePassword(user, 'correct');

      expect(result).toBe(true);
    });

    it('should return false for incorrect password', async () => {
      const hashKey = await bcrypt.genSalt();
      const password = await bcrypt.hash('correct', hashKey);

      const user = { _id: 'user1', password, hashKey } as any;
      const result = await service.validatePassword(user, 'wrong');

      expect(result).toBe(false);
    });
  });

  describe('resetPasswordWithToken', () => {
    it('should throw TokenExpiredException for invalid token', async () => {
      mockUserModel.findOne.mockResolvedValue(null);

      await expect(
        service.resetPasswordWithToken('invalid-token', 'newPass', 'en'),
      ).rejects.toThrow();
    });

    it('should update password on valid token', async () => {
      const mockUser = { _id: 'user1', email: 'test@test.com' };
      mockUserModel.findOne.mockResolvedValue(mockUser);
      mockUserModel.findOneAndUpdate.mockResolvedValue(mockUser);

      const result = await service.resetPasswordWithToken(
        'valid-token',
        'newPassword',
        'en',
      );

      expect(result.message).toContain('Password updated');
      expect(mockUserModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'user1' },
        expect.objectContaining({
          $set: expect.objectContaining({
            resetPasswordToken: undefined,
            resetPasswordExpires: undefined,
          }),
        }),
        { new: true },
      );
    });
  });

  describe('verifyEmail', () => {
    it('should throw TokenExpiredException for invalid token', async () => {
      mockUserModel.findOne.mockResolvedValue(null);

      await expect(service.verifyEmail('bad-token', 'en')).rejects.toThrow();
    });

    it('should verify email on valid token', async () => {
      const mockUser = { _id: 'user1', email: 'test@test.com' };
      mockUserModel.findOne.mockResolvedValue(mockUser);
      mockUserModel.findOneAndUpdate.mockResolvedValue(mockUser);

      const result = await service.verifyEmail('valid-token', 'en');

      expect(result.message).toContain('verified');
      expect(mockUserModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'user1' },
        expect.objectContaining({
          $set: expect.objectContaining({
            emailVerified: true,
          }),
        }),
        { new: true },
      );
    });
  });

  describe('changePassword', () => {
    it('should throw ResourceNotFoundException when user not found', async () => {
      mockUserModel.findById.mockResolvedValue(null);

      await expect(
        service.changePassword(
          { newPassword: 'newPass' },
          { _id: 'invalid' },
          'en',
        ),
      ).rejects.toThrow();
    });

    it('should update password for existing user', async () => {
      const mockUser = { _id: 'user1' };
      mockUserModel.findById.mockResolvedValue(mockUser);
      mockUserModel.findOneAndUpdate.mockResolvedValue(mockUser);

      const result = await service.changePassword(
        { newPassword: 'newPass123' },
        { _id: 'user1' },
        'en',
      );

      expect(result.message).toContain('Password updated');
      expect(mockUserModel.findOneAndUpdate).toHaveBeenCalled();
    });
  });
});
