import { Router } from "express";

export function createAIRouter(): Router {
  const router = Router();

  router.post("/chat", (_req, res) => {
    res.json({
      success: true,
      message: "Faith Harbor AI API is connected.",
    });
  });

  return router;
}