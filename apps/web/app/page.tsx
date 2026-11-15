import { Features } from '@/components/landing/Features'
import { FinalCta } from '@/components/landing/FinalCta'
import { Footer } from '@/components/landing/Footer'
import { Hero } from '@/components/landing/Hero'
import { Steps } from '@/components/landing/Steps'
import { SiteHeader } from '@/components/SiteHeader'

export default function LandingPage() {
  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader current="home" />
      <main className="flex-1">
        <Hero />
        <Features />
        <Steps />
        <FinalCta />
      </main>
      <Footer />
    </div>
  )
}
