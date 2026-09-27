import { postProposalLifecycle } from "../lifecycle";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return postProposalLifecycle(request, context, "withdraw");
}