import type { Router } from "express";
import express from "express";
import { config } from "../config.js";
import { buildTwilioTwiML } from "../services/twilio.js";
import { signStreamToken, webhookSecretAccepted } from "../services/voiceSecurity.js";
import { getWsBase } from "./api.js";

export function createVoiceRouter(): Router {
  const router = express.Router();

  router.post("/twilio", (req, res) => {
    if (!webhookSecretAccepted(typeof req.query.secret === "string" ? req.query.secret : undefined)) {
      res.status(401).type("text/plain").send("Unauthorized voice webhook");
      return;
    }
    const customerId =
      typeof req.query.customerId === "string" && req.query.customerId.trim()
        ? req.query.customerId
        : config.defaultCustomerId;
    const signed = signStreamToken(customerId);
    const streamUrl = `${getWsBase(req)}/api/voice/twilio/stream?customerId=${encodeURIComponent(customerId)}&ts=${encodeURIComponent(signed.ts)}&token=${encodeURIComponent(signed.token)}`;
    res.type("text/xml").send(buildTwilioTwiML(streamUrl, customerId));
  });

  router.get("/twilio", (req, res) => {
    if (!webhookSecretAccepted(typeof req.query.secret === "string" ? req.query.secret : undefined)) {
      res.status(401).type("text/plain").send("Unauthorized voice webhook");
      return;
    }
    const customerId =
      typeof req.query.customerId === "string" && req.query.customerId.trim()
        ? req.query.customerId
        : config.defaultCustomerId;
    const signed = signStreamToken(customerId);
    const streamUrl = `${getWsBase(req)}/api/voice/twilio/stream?customerId=${encodeURIComponent(customerId)}&ts=${encodeURIComponent(signed.ts)}&token=${encodeURIComponent(signed.token)}`;
    res.type("text/xml").send(buildTwilioTwiML(streamUrl, customerId));
  });

  return router;
}
