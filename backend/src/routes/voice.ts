import type { Router } from "express";
import express from "express";
import { config } from "../config.js";
import { buildTwilioTwiML } from "../services/twilio.js";
import { getWsBase } from "./api.js";

export function createVoiceRouter(): Router {
  const router = express.Router();

  router.post("/twilio", (req, res) => {
    const customerId =
      typeof req.query.customerId === "string" && req.query.customerId.trim()
        ? req.query.customerId
        : config.defaultCustomerId;
    const streamUrl = `${getWsBase(req)}/api/voice/twilio/stream?customerId=${encodeURIComponent(customerId)}`;
    res.type("text/xml").send(buildTwilioTwiML(streamUrl, customerId));
  });

  router.get("/twilio", (req, res) => {
    const customerId =
      typeof req.query.customerId === "string" && req.query.customerId.trim()
        ? req.query.customerId
        : config.defaultCustomerId;
    const streamUrl = `${getWsBase(req)}/api/voice/twilio/stream?customerId=${encodeURIComponent(customerId)}`;
    res.type("text/xml").send(buildTwilioTwiML(streamUrl, customerId));
  });

  return router;
}
