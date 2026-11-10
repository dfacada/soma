// Public: where an invite link lands. Outside the signed-in group, like /privacy/ and /terms/, because the person
// holding the link usually has no account yet.

import type { Metadata } from "next";
import { JoinInvite } from "@/components/app/JoinInvite";

export const metadata: Metadata = { title: "You're invited · Dayhub", description: "An invitation to Dayhub." };

export default function Join() {
  return <JoinInvite />;
}
