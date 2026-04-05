import { Server as HttpServer } from "http";
import { Server } from "socket.io";

let io: Server | null = null;

export function setupSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: ["http://localhost:5173", "https://ooru.ai"],
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log(`[socket] Client connected: ${socket.id}`);

    socket.on("join", ({ merchantId }: { merchantId: number }) => {
      const room = `merchant:${merchantId}`;
      socket.join(room);
      console.log(`[socket] ${socket.id} joined ${room}`);
    });

    socket.on("disconnect", () => {
      console.log(`[socket] Client disconnected: ${socket.id}`);
    });
  });

  return io;
}

export function getIO(): Server | null {
  return io;
}

export function emitToMerchant(merchantId: number, event: string, data: any) {
  if (io) {
    io.to(`merchant:${merchantId}`).emit(event, data);
  }
}
