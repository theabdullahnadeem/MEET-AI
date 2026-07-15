import Link from "next/link";
import Image from "next/image";

// ============================================================================
// LEGAL PAGES — DRAFT, NOT LEGAL ADVICE.
// These pages were generated from the templates in docs/legal/ and MUST be
// reviewed by a qualified lawyer (Pakistan operator + US/UK/EU users) before
// being relied on in production. Bracket-free by design so they are usable at
// launch, but review is still required.
// ============================================================================

interface Props {
  children: React.ReactNode;
}

const LegalLayout = ({ children }: Props) => {
  return (
    <div className="min-h-screen bg-radial from-sidebar-accent to-sidebar py-10 px-4">
      <div className="max-w-3xl mx-auto flex flex-col gap-y-6">
        <Link href="/" className="flex items-center gap-2 text-white w-fit">
          <Image src="/logo.svg" height={32} width={32} alt="Meet.AI" />
          <span className="font-semibold text-xl">Meet.AI</span>
        </Link>
        <div className="bg-background rounded-xl shadow-sm p-6 md:p-10">
          {/* Shared typography for the legal articles rendered inside. */}
          <article
            className="
              [&_h1]:text-2xl [&_h1]:md:text-3xl [&_h1]:font-semibold [&_h1]:mb-1
              [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:text-primary
              [&_p]:mb-3 [&_p]:leading-relaxed [&_p]:text-[15px]
              [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3 [&_ul]:text-[15px]
              [&_li]:mb-1.5 [&_li]:leading-relaxed
              [&_strong]:font-semibold
              [&_a]:underline [&_a]:underline-offset-2
              [&_table]:w-full [&_table]:text-sm [&_table]:my-4 [&_table]:border-collapse
              [&_th]:text-left [&_th]:font-semibold [&_th]:border-b [&_th]:py-2 [&_th]:pr-4
              [&_td]:border-b [&_td]:py-2 [&_td]:pr-4 [&_td]:align-top
            "
          >
            {children}
          </article>
        </div>
        <div className="flex gap-x-4 text-sm text-white/70">
          <Link href="/privacy" className="hover:text-white">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-white">Terms of Service</Link>
          <Link href="/sign-in" className="hover:text-white ml-auto">Back to Meet.AI</Link>
        </div>
      </div>
    </div>
  );
};

export default LegalLayout;
