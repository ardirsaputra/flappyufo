import type { NextApiRequest, NextApiResponse } from "next";

// Socket.IO is initialized by the custom server (server.js).
// This endpoint exists only as a wakeup ping for the frontend.
export const config = { api: { bodyParser: false } };

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.status(200).end();
}
