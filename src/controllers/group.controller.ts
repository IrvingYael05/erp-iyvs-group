import { Response } from "express";
import { AuthRequest } from "../middlewares/auth.middleware";
import { supabase } from "../config/supabase";
import { ApiResponse } from "../interfaces/api-response";

const NIVELES_PERMITIDOS = ["Básico", "Intermedio", "Avanzado"];

// ----- Crear un Grupo -----
export const createGroup = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { nombre, descripcion, nivel } = req.body;

    if (!nombre || nombre.trim().length < 3) {
      return res.status(400).json({
        statusCode: 400,
        intOpCode: 1,
        data: [
          {
            message:
              "El nombre del grupo es obligatorio y debe tener al menos 3 caracteres.",
          },
        ],
      } as ApiResponse);
    }

    if (!nivel || !NIVELES_PERMITIDOS.includes(nivel)) {
      return res.status(400).json({
        statusCode: 400,
        intOpCode: 1,
        data: [
          {
            message: `El nivel no es válido. Debe ser uno de: ${NIVELES_PERMITIDOS.join(", ")}`,
          },
        ],
      } as ApiResponse);
    }

    const { data: newGroup, error: groupError } = await supabase
      .from("grupos")
      .insert({
        nombre: nombre.trim(),
        descripcion: descripcion ? descripcion.trim() : null,
        nivel: nivel,
        creador_id: userId,
      })
      .select()
      .single();

    if (groupError || !newGroup) {
      return res.status(500).json({
        statusCode: 500,
        intOpCode: 2,
        data: [{ message: "Error al registrar el grupo en la base de datos." }],
      } as ApiResponse);
    }

    const permisosTotales = [
      "ticket:view",
      "ticket:add",
      "ticket:edit",
      "ticket:delete",
    ];

    const { error: memberError } = await supabase
      .from("grupo_miembros")
      .insert({
        grupo_id: newGroup.id,
        usuario_id: userId,
        permisos_locales: permisosTotales,
      });

    if (memberError) {
      await supabase.from("grupos").delete().eq("id", newGroup.id);

      return res.status(500).json({
        statusCode: 500,
        intOpCode: 3,
        data: [
          {
            message:
              "Error al configurar el grupo. Se ha cancelado su creación.",
          },
        ],
      } as ApiResponse);
    }

    const { data: usuario } = await supabase
      .from("usuarios")
      .select("permisos_globales")
      .eq("id", userId)
      .single();

    const permisosActuales = usuario?.permisos_globales || [];
    if (!permisosActuales.includes("group-detail:view")) {
      await supabase
        .from("usuarios")
        .update({ permisos: [...permisosActuales, "group-detail:view"] })
        .eq("id", userId);
    }

    return res.status(201).json({
      statusCode: 201,
      intOpCode: 0,
      data: [
        {
          message: "Grupo creado exitosamente.",
          group: newGroup,
        },
      ],
    } as ApiResponse);
  } catch (err) {
    return res.status(500).json({
      statusCode: 500,
      intOpCode: 99,
      data: [{ message: "Error interno del servidor al crear el grupo." }],
    } as ApiResponse);
  }
};

// ----- Obtener Mis Grupos -----
export const getMyGroups = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const { data, error } = await supabase
      .from("grupo_miembros")
      .select(
        `
        permisos_locales,
        fecha_unido,
        grupos (
          id,
          nombre,
          descripcion,
          nivel,
          creado_en,
          usuarios!grupos_creador_id_fkey (nombre_completo)
        )
      `,
      )
      .eq("usuario_id", userId);

    if (error || !data) {
      return res.status(500).json({
        statusCode: 500,
        intOpCode: 1,
        data: [{ message: "Error al obtener tus grupos." }],
      } as ApiResponse);
    }

    const misGrupos = data.map((registro: any) => ({
      id: registro.grupos.id,
      nombre: registro.grupos.nombre,
      descripcion: registro.grupos.descripcion,
      nivel: registro.grupos.nivel,
      creadoEn: registro.grupos.creado_en,
      autor: registro.grupos.usuarios?.nombre_completo || "Desconocido",
      misPermisosLocales: registro.permisos_locales,
      fechaUnido: registro.fecha_unido,
    }));

    return res.status(200).json({
      statusCode: 200,
      intOpCode: 0,
      data: misGrupos,
    } as ApiResponse);
  } catch (err) {
    return res.status(500).json({
      statusCode: 500,
      intOpCode: 99,
      data: [{ message: "Error interno del servidor." }],
    } as ApiResponse);
  }
};

// ----- Obtener Todos los Grupos -----
export const getAllGroups = async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = req.query.search as string;

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase.from("grupos").select(
      `
        id, nombre, descripcion, nivel, creado_en,
        usuarios!grupos_creador_id_fkey (nombre_completo),
        grupo_miembros (count),
        tickets (count)
      `,
      { count: "exact" },
    );

    if (search) {
      query = query.or(
        `nombre.ilike.%${search}%,descripcion.ilike.%${search}%`,
      );
    }

    const { data, error, count } = await query
      .order("creado_en", { ascending: false })
      .range(from, to);

    if (error || !data) {
      return res.status(500).json({
        statusCode: 500,
        intOpCode: 1,
        data: [
          { message: "Error al consultar los grupos en la base de datos." },
        ],
      } as ApiResponse);
    }

    const mappedGroups = data.map((grupo: any) => ({
      id: grupo.id,
      nombre: grupo.nombre,
      descripcion: grupo.descripcion,
      nivel: grupo.nivel,
      creadoEn: grupo.creado_en,
      autor: grupo.usuarios?.nombre_completo || "Desconocido",
      integrantes: grupo.grupo_miembros[0]?.count || 0,
      tickets: grupo.tickets[0]?.count || 0,
    }));

    return res.status(200).json({
      statusCode: 200,
      intOpCode: 0,
      data: [{ groups: mappedGroups, totalRecords: count || 0 }],
    } as ApiResponse);
  } catch (err) {
    return res.status(500).json({
      statusCode: 500,
      intOpCode: 99,
      data: [{ message: "Error interno del servidor al obtener los grupos." }],
    } as ApiResponse);
  }
};

// ----- Obtener Detalle de un Grupo -----
export const getGroupById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("grupos")
      .select(
        `
        id, nombre, descripcion, nivel, creado_en,
        usuarios!grupos_creador_id_fkey (nombre_completo),
        grupo_miembros (
          usuarios (email)
        )
      `,
      )
      .eq("id", id)
      .single();

    if (error || !data) {
      return res.status(404).json({
        statusCode: 404,
        intOpCode: 1,
        data: [{ message: "Grupo no encontrado." }],
      } as ApiResponse);
    }

    const integrantesList = data.grupo_miembros.map(
      (miembro: any) => miembro.usuarios?.email,
    );

    const groupDetail = {
      id: data.id,
      nombre: data.nombre,
      descripcion: data.descripcion,
      nivel: data.nivel,
      creadoEn: data.creado_en,
      autor: (data.usuarios as any)?.nombre_completo || "Desconocido",
      integrantesList: integrantesList,
    };

    return res.status(200).json({
      statusCode: 200,
      intOpCode: 0,
      data: [groupDetail],
    } as ApiResponse);
  } catch (err) {
    return res.status(500).json({
      statusCode: 500,
      intOpCode: 99,
      data: [
        {
          message:
            "Error interno del servidor al obtener el detalle del grupo.",
        },
      ],
    } as ApiResponse);
  }
};

// ----- Actualizar Grupo -----
export const updateGroup = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { nombre, descripcion, nivel } = req.body;

    if (!nombre || nombre.trim().length < 3) {
      return res.status(400).json({
        statusCode: 400,
        intOpCode: 1,
        data: [
          {
            message:
              "El nombre del grupo es obligatorio y debe tener al menos 3 caracteres.",
          },
        ],
      } as ApiResponse);
    }

    if (!nivel || !NIVELES_PERMITIDOS.includes(nivel)) {
      return res.status(400).json({
        statusCode: 400,
        intOpCode: 1,
        data: [
          {
            message: `El nivel no es válido. Debe ser uno de: ${NIVELES_PERMITIDOS.join(", ")}`,
          },
        ],
      } as ApiResponse);
    }

    const { data, error } = await supabase
      .from("grupos")
      .update({
        nombre: nombre.trim(),
        descripcion: descripcion ? descripcion.trim() : null,
        nivel: nivel,
      })
      .eq("id", id)
      .select()
      .single();

    if (error || !data) {
      return res.status(400).json({
        statusCode: 400,
        intOpCode: 2,
        data: [
          { message: "Error al actualizar el grupo en la base de datos." },
        ],
      } as ApiResponse);
    }

    return res.status(200).json({
      statusCode: 200,
      intOpCode: 0,
      data: [{ message: "Grupo actualizado exitosamente.", group: data }],
    } as ApiResponse);
  } catch (err) {
    return res.status(500).json({
      statusCode: 500,
      intOpCode: 99,
      data: [{ message: "Error interno del servidor al actualizar el grupo." }],
    } as ApiResponse);
  }
};

// ----- Eliminar Grupo -----
export const deleteGroup = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const { error: groupError } = await supabase
      .from("grupos")
      .delete()
      .eq("id", id);

    if (groupError) {
      return res.status(400).json({
        statusCode: 400,
        intOpCode: 2,
        data: [
          {
            message: `No se pudo eliminar el grupo. Es posible que tenga dependencias (como tickets) activas. Detalle: ${groupError.message}`,
          },
        ],
      } as ApiResponse);
    }

    return res.status(200).json({
      statusCode: 200,
      intOpCode: 0,
      data: [{ message: "Grupo eliminado correctamente." }],
    } as ApiResponse);
  } catch (err) {
    return res.status(500).json({
      statusCode: 500,
      intOpCode: 99,
      data: [{ message: "Error interno del servidor al eliminar el grupo." }],
    } as ApiResponse);
  }
};

// ----- Obtener Miembros de un Grupo -----
export const getGroupMembers = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = req.query.search as string;

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from("grupo_miembros")
      .select(
        `
        usuario_id,
        permisos_locales,
        fecha_unido,
        usuarios!inner (email, nombre_completo)
      `,
        { count: "exact" },
      )
      .eq("grupo_id", id);

    if (search) {
      query = query.or(
        `nombre_completo.ilike.%${search}%,email.ilike.%${search}%`,
        { foreignTable: "usuarios" },
      );
    }

    const { data, error, count } = await query
      .order("fecha_unido", { ascending: false })
      .range(from, to);

    if (error || !data) {
      return res.status(500).json({
        statusCode: 500,
        intOpCode: 1,
        data: [
          {
            message: "Error al obtener los integrantes del grupo.",
          },
        ],
      } as ApiResponse);
    }

    const miembros = data.map((miembro: any) => ({
      userId: miembro.usuario_id,
      email: miembro.usuarios.email,
      nombreCompleto: miembro.usuarios.nombre_completo,
      permissions: miembro.permisos_locales,
      fechaUnido: miembro.fecha_unido,
    }));

    return res.status(200).json({
      statusCode: 200,
      intOpCode: 0,
      data: [{ members: miembros, totalRecords: count || 0 }],
    } as ApiResponse);
  } catch (err) {
    return res.status(500).json({
      statusCode: 500,
      intOpCode: 99,
      data: [{ message: "Error interno del servidor." }],
    } as ApiResponse);
  }
};

// ----- Agregar un Miembro al Grupo -----
export const addGroupMember = async (req: AuthRequest, res: Response) => {
  try {
    const { id: grupoId } = req.params;
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        statusCode: 400,
        intOpCode: 1,
        data: [{ message: "El correo del usuario es obligatorio." }],
      } as ApiResponse);
    }

    const { data: usuario, error: userError } = await supabase
      .from("usuarios")
      .select("id, email, nombre_completo, permisos_globales")
      .eq("email", email.toLowerCase().trim())
      .single();

    if (userError || !usuario) {
      return res.status(404).json({
        statusCode: 404,
        intOpCode: 2,
        data: [
          { message: "No existe un usuario con este correo en el sistema." },
        ],
      } as ApiResponse);
    }

    const permisosPorDefecto = [
      "ticket:view",
      "ticket:add",
      "ticket:edit",
      "ticket:delete",
    ];

    const { error: insertError } = await supabase
      .from("grupo_miembros")
      .insert({
        grupo_id: grupoId,
        usuario_id: usuario.id,
        permisos_locales: permisosPorDefecto,
      });

    if (insertError) {
      if (insertError.code === "23505") {
        return res.status(400).json({
          statusCode: 400,
          intOpCode: 3,
          data: [{ message: "Este usuario ya es integrante del grupo." }],
        } as ApiResponse);
      }
      throw insertError;
    }

    const permisosActuales = usuario.permisos_globales || [];
    if (!permisosActuales.includes("group-detail:view")) {
      await supabase
        .from("usuarios")
        .update({ permisos: [...permisosActuales, "group-detail:view"] })
        .eq("id", usuario.id);
    }

    return res.status(201).json({
      statusCode: 201,
      intOpCode: 0,
      data: [
        {
          message: "Integrante agregado correctamente.",
          member: {
            userId: usuario.id,
            email: usuario.email,
            nombreCompleto: usuario.nombre_completo,
            permissions: permisosPorDefecto,
          },
        },
      ],
    } as ApiResponse);
  } catch (err) {
    return res.status(500).json({
      statusCode: 500,
      intOpCode: 99,
      data: [
        { message: "Error interno del servidor al agregar el integrante." },
      ],
    } as ApiResponse);
  }
};

// ----- Actualizar Permisos Locales -----
export const updateMemberPermissions = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const { id: grupoId, userId } = req.params;
    const { permissions } = req.body;

    if (userId === req.user!.id) {
      return res.status(403).json({
        statusCode: 403,
        intOpCode: 1,
        data: [{ message: "No puedes actualizar tus propios permisos." }],
      } as ApiResponse);
    }

    if (!userId) {
      return res.status(400).json({
        statusCode: 400,
        intOpCode: 1,
        data: [{ message: "El ID del usuario es obligatorio." }],
      } as ApiResponse);
    }

    if (!grupoId) {
      return res.status(400).json({
        statusCode: 400,
        intOpCode: 1,
        data: [{ message: "El ID del grupo es obligatorio." }],
      } as ApiResponse);
    }

    if (!Array.isArray(permissions)) {
      return res.status(400).json({
        statusCode: 400,
        intOpCode: 1,
        data: [{ message: "El formato de los permisos es inválido." }],
      } as ApiResponse);
    }

    const { error } = await supabase
      .from("grupo_miembros")
      .update({ permisos_locales: permissions })
      .eq("grupo_id", grupoId)
      .eq("usuario_id", userId);

    if (error) {
      return res.status(400).json({
        statusCode: 400,
        intOpCode: 2,
        data: [
          { message: "Error al actualizar los permisos en la base de datos." },
        ],
      } as ApiResponse);
    }

    return res.status(200).json({
      statusCode: 200,
      intOpCode: 0,
      data: [
        { message: "Permisos del integrante actualizados correctamente." },
      ],
    } as ApiResponse);
  } catch (err) {
    return res.status(500).json({
      statusCode: 500,
      intOpCode: 99,
      data: [{ message: "Error interno del servidor." }],
    } as ApiResponse);
  }
};

// ----- Eliminar Miembro -----
export const removeMember = async (req: AuthRequest, res: Response) => {
  try {
    const { id: grupoId, userId } = req.params;

    if (userId === req.user!.id) {
      return res.status(403).json({
        statusCode: 403,
        intOpCode: 1,
        data: [{ message: "No puedes eliminarte a ti mismo del grupo." }],
      } as ApiResponse);
    }

    const { error } = await supabase
      .from("grupo_miembros")
      .delete()
      .eq("grupo_id", grupoId)
      .eq("usuario_id", userId);

    await supabase
      .from("tickets")
      .update({ asignado_id: null })
      .eq("grupo_id", grupoId)
      .eq("asignado_id", userId);

    if (error) {
      return res.status(400).json({
        statusCode: 400,
        intOpCode: 2,
        data: [
          { message: "Error al remover al integrante de la base de datos." },
        ],
      } as ApiResponse);
    }

    return res.status(200).json({
      statusCode: 200,
      intOpCode: 0,
      data: [{ message: "Integrante removido del grupo exitosamente." }],
    } as ApiResponse);
  } catch (err) {
    return res.status(500).json({
      statusCode: 500,
      intOpCode: 99,
      data: [{ message: "Error interno del servidor." }],
    } as ApiResponse);
  }
};
