import { TwoFactorView } from "@/modules/auth/ui/views/two-factor-view";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

// C.7: the second sign-in step for 2FA-enabled accounts. Users land here via
// the twoFactorClient redirect; a fully signed-in user has no business here.
const Page = async () => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!!session) {
    redirect("/");
  }

  return <TwoFactorView />;
};
export default Page;
