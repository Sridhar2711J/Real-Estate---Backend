import swaggerJSDoc from 'swagger-jsdoc';
import { env } from './env';

const swaggerOptions: swaggerJSDoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Real Estate Platform API',
      version: '1.0.0',
      description: 'REST API documentation for the Real Estate application backend',
      contact: {
        name: 'API Support',
      },
    },
    servers: [
      {
        url: `http://localhost:${env.PORT}`,
        description: 'Local development server',
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT token in the format: Bearer <token>',
        },
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string', format: 'email' },
            name: { type: 'string' },
            phone: { type: 'string', nullable: true },
            avatar: { type: 'string', nullable: true },
            role: { type: 'string', enum: ['USER', 'AGENT', 'ADMIN'] },
            isActive: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        RegisterInput: {
          type: 'object',
          required: ['email', 'password', 'name'],
          properties: {
            email: { type: 'string', format: 'email', example: 'john@example.com' },
            password: { type: 'string', minLength: 6, example: 'secret123' },
            name: { type: 'string', example: 'John Doe' },
            phone: { type: 'string', example: '+1234567890' },
            role: { type: 'string', enum: ['USER', 'AGENT', 'ADMIN'], default: 'USER' },
          },
        },
        LoginInput: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email', example: 'john@example.com' },
            password: { type: 'string', example: 'secret123' },
          },
        },
        ApiResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            data: { type: 'object', nullable: true },
          },
        },
        Property: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            slug: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            features: { type: 'array', items: { type: 'string' } },
            price: { type: 'number' },
            propertyType: { type: 'string' },
            city: { type: 'string' },
            location: { type: 'string' },
            address: { type: 'string', nullable: true },
            bedrooms: { type: 'integer' },
            bathrooms: { type: 'integer' },
            area: { type: 'number' },
            coverImage: { type: 'string' },
            status: { type: 'string', enum: ['active', 'inactive', 'sold'] },
            sellerId: { type: 'string', format: 'uuid' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        CreatePropertyInput: {
          type: 'object',
          required: ['title', 'propertyType', 'price', 'city', 'location', 'description', 'coverImage'],
          properties: {
            title: { type: 'string', example: 'Luxury 3 BHK Penthouse' },
            slug: { type: 'string', example: 'luxury-3-bhk-penthouse' },
            propertyType: { type: 'string', example: 'apartment' },
            price: { type: 'number', example: 15000000 },
            city: { type: 'string', example: 'Pune' },
            location: { type: 'string', example: 'Baner' },
            address: { type: 'string', example: 'High Street, Baner' },
            bedrooms: { type: 'integer', example: 3 },
            bathrooms: { type: 'integer', example: 3 },
            area: { type: 'number', example: 2100 },
            description: { type: 'string', example: 'Spacious penthouse with stunning views' },
            coverImage: { type: 'string', example: 'https://images.unsplash.com/...' },
            features: { type: 'array', items: { type: 'string' } },
            status: { type: 'string', enum: ['active', 'inactive', 'sold'], default: 'active' },
          },
        },
      },
    },
  },
  apis: ['./src/routes/*.ts', './dist/routes/*.js'],
};

export const swaggerSpec = swaggerJSDoc(swaggerOptions);

