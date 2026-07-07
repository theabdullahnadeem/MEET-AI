import { serve } from "inngest/next";
import { inngest } from "../../../inngest/client";
import {
  meetingsFinalize,
  meetingsHostLeft,
  meetingsProcessing,
} from "@/inngest/function";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [meetingsProcessing, meetingsHostLeft, meetingsFinalize],
});
