import { Router } from "express";
import {
  createGroup,
  getMyGroups,
  getAllGroups,
  getGroupById,
  updateGroup,
  deleteGroup,
  getGroupMembers,
  addGroupMember,
  updateMemberPermissions,
  removeMember,
} from "../controllers/group.controller";
import { verifyToken, requirePermission } from "../middlewares/auth.middleware";

const router = Router();

router.use(verifyToken);

router.post("/", requirePermission("group:add"), createGroup);
router.get("/me", getMyGroups);
router.get("/", requirePermission("group:view"), getAllGroups);
router.get("/:id", requirePermission("group-detail:view"), getGroupById);
router.put("/:id", requirePermission("group:edit"), updateGroup);
router.delete("/:id", requirePermission("group:delete"), deleteGroup);
router.get("/:id/members", requirePermission("group-detail:view"), getGroupMembers);
router.post("/:id/members", requirePermission("group-detail:edit"), addGroupMember);
router.put("/:id/members/:userId/permissions", requirePermission("group-detail:edit"), updateMemberPermissions);
router.delete("/:id/members/:userId", requirePermission("group-detail:edit"), removeMember);

export default router;
