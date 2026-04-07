import { Request, Response, NextFunction } from "express";
import { supabase } from "../config/supabase";
import { ApiResponse } from "../interfaces/api-response";

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    permisos: string[];
  };
}

export const verifyToken = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      statusCode: 401,
      intOpCode: 1,
      data: [{ message: "No se proporcionó un token de autenticación." }],
    } as ApiResponse);
  }

  const token = authHeader.split(" ")[1];

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        statusCode: 401,
        intOpCode: 2,
        data: [{ message: "Token inválido o expirado." }],
      } as ApiResponse);
    }

    const { data: userData } = await supabase
      .from("usuarios")
      .select("permisos_globales")
      .eq("id", user.id)
      .single();

    req.user = {
      id: user.id,
      email: user.email as string,
      permisos: userData?.permisos_globales || [],
    };

    next();
  } catch (error) {
    return res.status(500).json({
      statusCode: 500,
      intOpCode: 99,
      data: [{ message: "Error validando autenticación." }],
    } as ApiResponse);
  }
};

export const requirePermission = (requiredPermission: string) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const userPermissions = req.user?.permisos || [];

    if (!userPermissions.includes(requiredPermission)) {
      return res.status(403).json({
        statusCode: 403,
        intOpCode: 1,
        data: [
          {
            message:
              "Acceso denegado. No tienes permisos para realizar esta acción.",
          },
        ],
      } as ApiResponse);
    }
    next();
  };
};
