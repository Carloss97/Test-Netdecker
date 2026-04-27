import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../utils/db.js';
import { ValidationError, UnauthorizedError, ConflictError } from '../utils/errors.js';

const JWT_SECRET = process.env.JWT_SECRET || 'customer-secret-key-change-me';
const TOKEN_EXPIRY = '7d';

export class CustomerAuthService {
  static async register(input: {
    storeId: string;
    email: string;
    password: string;
    name: string;
    phone?: string;
    address?: string;
  }) {
    const email = input.email.toLowerCase().trim();
    
    // Check if customer already exists for this store
    const existing = await prisma.customer.findUnique({
      where: {
        storeId_email: {
          storeId: input.storeId,
          email,
        }
      }
    });

    if (existing) {
      throw new ConflictError('Este correo ya está registrado en esta tienda');
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(input.password, salt);

    const customer = await prisma.customer.create({
      data: {
        storeId: input.storeId,
        email,
        passwordHash,
        name: input.name,
        phone: input.phone,
        address: input.address,
      }
    });

    const token = this.generateToken(customer.id, customer.storeId);
    return { customer: this.sanitizeCustomer(customer), token };
  }

  static async login(input: { storeId: string; email: string; password: string }) {
    const email = input.email.toLowerCase().trim();
    
    const customer = await prisma.customer.findUnique({
      where: {
        storeId_email: {
          storeId: input.storeId,
          email,
        }
      }
    });

    if (!customer || !customer.isActive) {
      throw new UnauthorizedError('Credenciales inválidas');
    }

    const isValid = await bcrypt.compare(input.password, customer.passwordHash);
    if (!isValid) {
      throw new UnauthorizedError('Credenciales inválidas');
    }

    await prisma.customer.update({
      where: { id: customer.id },
      data: { lastLoginAt: new Date() }
    });

    const token = this.generateToken(customer.id, customer.storeId);
    return { customer: this.sanitizeCustomer(customer), token };
  }

  static async validateToken(token: string) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { sub: string; storeId: string };
      const customer = await prisma.customer.findUnique({
        where: { id: decoded.sub }
      });

      if (!customer || !customer.isActive) return null;
      return customer;
    } catch {
      return null;
    }
  }

  private static generateToken(customerId: string, storeId: string) {
    return jwt.sign({ sub: customerId, storeId }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
  }

  private static sanitizeCustomer(customer: any) {
    const { passwordHash, ...safe } = customer;
    return safe;
  }
}

export default CustomerAuthService;
