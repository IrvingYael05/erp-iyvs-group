import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import groupRoutes from "./routes/group.routes";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3002;

app.use(cors());
app.use(express.json());

// Enrutador principal del microservicio
app.use("/api/groups", groupRoutes);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
