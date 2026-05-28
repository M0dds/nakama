import { A } from "@solidjs/router";
import { PageHeader } from "@/components/PageHeader";
import { BentoModule } from "@/components/BentoModule";
import { Button } from "@/components/Button";
import { ColumnGuide } from "@/components/ColumnGuide";

/**
 * Placeholder Home using the real structural primitives — PageHeader sits on
 * top, two BentoModule sections compose the body, Buttons handle the CTAs.
 * When Phase 5 lands (Was kommt / Fortsetzen / Logbuch), the section
 * *contents* swap in but the frame stays as it is.
 */
export default function Home() {
  return (
    <main class="w-full">
      <PageHeader
        title="Willkommen."
        aside={
          <span class="font-mono text-mini uppercase tracking-wider text-text-muted">
            Phase 1 · Foundation
          </span>
        }
      />

      <ColumnGuide />

      <div class="flex flex-col md:flex-row md:items-start">
        <div class="md:w-2/3">
          <BentoModule label="Status" number="01">
            <p class="text-body text-text">
              Das Scaffold steht. Tokens, Themes, Router, Supabase-Client und
              QueryClient sind bereit. Echte Inhalte landen ab Phase 3.
            </p>
            <div class="mt-5 flex flex-wrap gap-3">
              <A href="/styleguide">
                <Button variant="primary">Styleguide öffnen</Button>
              </A>
              <A href="/login">
                <Button variant="secondary">Login (Stub)</Button>
              </A>
            </div>
          </BentoModule>
        </div>

        <div class="border-t border-rule md:w-1/3 md:border-t-0">
          <BentoModule label="Nächste Phase" number="02">
            <p class="text-body text-text-muted">
              Phase 2 — Auth & Shell: Discord OAuth + Magic-Link wieder
              anschließen, dann die Floating-Bottom-Nav und der App-Shell.
            </p>
          </BentoModule>
        </div>
      </div>
    </main>
  );
}
