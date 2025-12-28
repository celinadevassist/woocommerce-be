# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
npm install                    # Install dependencies
npm run start:dev              # Development server with hot reload (port 3041)
npm run build                  # Production build (compiles + copies templates)
npm run start:prod             # Run production build
npm run lint                   # ESLint with auto-fix
npm run format                 # Prettier formatting
npm run test                   # Run Jest tests
npm run test:watch             # Watch mode
npm run test:e2e               # End-to-end tests
```

## Architecture Overview

This is a NestJS backend API with MongoDB/Mongoose. The application runs on port 3041 with all routes prefixed under `/api`.

### Core Directory Structure

```
src/
├── app.module.ts              # Root module, imports all feature modules
├── main.ts                    # Application bootstrap, CORS, global filters
├── config.manager.ts          # Environment-based config loader
├── swagger.config.ts          # Swagger/OpenAPI setup (dev only at /api/)
│
├── auth/                      # JWT + Passport authentication
├── modules/                   # Core infrastructure modules
│   ├── users.module.ts        # User management
│   ├── roles.module.ts        # Role-based access control
│   ├── s3-upload/             # AWS S3 file uploads
│   └── search-analytics/      # Search tracking
│
├── idea-keep/                 # Three-tier hierarchical content system
│   ├── idea/                  # Top level: main concepts/projects
│   ├── idea-group/            # Middle: organizational containers
│   ├── group-content/         # Bottom: actual items/tasks
│   ├── idea-group-relation/   # Links ideas to groups with position
│   └── group-content-relation/# Links groups to contents with position
│
├── shared/payment/ziina/      # Ziina payment gateway integration
├── fb-pixel/                  # Facebook Pixel tracking
├── facebook-support/          # Facebook support integration
├── common_metadata_module/    # Shared metadata management
│
├── schema/                    # Mongoose schemas (User, Role, Image, ActionLog)
├── services/                  # Shared services (OpenAI, Email, SMS, Zoom)
├── guards/                    # Auth guards (RolesGuard, EmailVerifiedGuard)
├── decorators/                # Custom decorators (@User, @Scopes)
├── dtos/                      # Shared DTOs (pagination, validation)
├── pipes/                     # Validation pipes (JoiValidationPipe)
├── enums/                     # Shared enums
├── helpers/                   # Utility functions
├── filters/                   # Exception filters
└── config/                    # Environment configs (default, dev, staging, prod)
```

### Module Pattern

Each feature module follows a consistent structure:
```
feature/
├── module.ts         # NestJS module definition
├── controller.ts     # HTTP endpoints with Swagger decorators
├── service.ts        # Business logic
├── schema.ts         # Mongoose schema definition
├── dto.create.ts     # Create DTO with Joi validation
├── dto.update.ts     # Update DTO
├── dto.query.ts      # Query/filter DTO
├── interface.ts      # TypeScript interfaces
└── enum.ts           # Feature-specific enums
```

### Key Patterns

**Bilingual Routes**: Controllers use `:lang` path parameter (en/ar):
```typescript
@Controller(':lang/idea')
```

**Scope-Based Authorization**: Roles have scopes like `idea:create`, `user:read`. Guards check:
- `*:*` - Full access
- `feature:*` - All actions on feature
- `feature:action` - Specific action

**Validation**: Uses Joi via `JoiValidationPipe` for request validation:
```typescript
@UsePipes(new JoiValidationPipe({ body: CreateDto, param: { lang: LanguageSchema } }))
```

**Email Provider Toggle**: Configurable via `EMAIL_PROVIDER` env var (`smtp` or `mailrelay`)

### Idea Keep System

A three-tier hierarchical organization system with relation tables for flexible ordering:
- **Ideas** - Top-level concepts (books, projects, courses)
- **Groups** - Organizational containers (chapters, phases, modules)
- **Contents** - Actual items with status tracking (TODO, IN_PROGRESS, COMPLETED)

Relations allow groups/contents to belong to multiple parents with independent ordering via `position` field.

## Configuration

Environment-based config in `src/config/`:
- `default.json` - Fallback config
- `development.json`, `staging.json`, `production.json` - Environment-specific

Key environment variables:
- `NODE_ENV` - development/staging/production
- `DB_URI` - MongoDB connection string
- `PORT` - Server port (default 3041)
- `FRONTEND_URL` - Comma-separated allowed origins for CORS
- `EMAIL_PROVIDER` - `smtp` or `mailrelay`
- `MAX_REQUEST_SIZE` - Request body limit (default 50mb)

## API Documentation

Swagger UI available at `/api/` in development mode. Raw JSON at `/swagger-json`.

## Webhook Handling

`main.ts` includes custom body parsing that preserves raw body for `/webhooks/*` endpoints (needed for signature verification).
