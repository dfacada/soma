// Public. The page David emails to a new member: how to add Soma to a Home Screen on iPhone, Android or a computer.
// Outside the signed-in group on purpose, like /privacy/ and /terms/: it has to open before anyone has an account.

import type { Metadata } from "next";
import { Install } from "@/components/Install";

export const metadata: Metadata = {
  title: "Add Soma to your Home Screen",
  description: "How to put Soma on your iPhone, iPad, Android phone or computer, in a few taps.",
};

export default function InstallPage() {
  return <Install />;
}
