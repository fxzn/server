import jwt from 'jsonwebtoken';
import { prismaClient } from '../application/database.js';


export const authMiddleware = async (req, res, next) => {
    const token = req.get('Authorization')?.replace('Bearer ', '').trim();
    
    // 1. Basic check
    if (!token) {
        return res.status(401).json({ errors: "Token required" });
    }

    try {
        // 2. Verify JWT structure & signature
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // 3. Check token in database
        const user = await prismaClient.user.findUnique({
            where: { 
                id: decoded.id,
                token: token 
            },
            select: {
                id: true,
                email: true,
                role: true,
                // Hindari return password/token
            }
        });

        if (!user) {
            return res.status(401).json({ errors: "Invalid or revoked token" });
        }

        // 4. Attach user to request
        req.user = user;
        next();

    } catch (error) {
        // Handle specific JWT errors
        if (error instanceof jwt.JsonWebTokenError) {
            return res.status(401).json({ errors: "Invalid token format" });
        }
        if (error instanceof jwt.TokenExpiredError) {
            return res.status(401).json({ errors: "Token expired" });
        }

        console.error('Auth error:', error);
        return res.status(500).json({ errors: "Internal server error" });
    }
};


export const adminMiddleware = async (req, res, next) => {
    if (req.user.role !== 'ADMIN') {
        return res.status(403).json({
            errors: "Forbidden: Admin access required"
        });
    }
    next();
};

