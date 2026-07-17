import './globals.css';
import Link from 'next/link';
import Image from 'next/image';

export const metadata = {
  title: 'Cheap Travels India — Affordable Bus Tickets',
  description: 'India\'s most affordable bus booking. Direct from operator. Trusted tickets pushed to your WhatsApp in 90 seconds.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap" rel="stylesheet" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png" />
        <link rel="icon" href="/favicon-16.png" sizes="16x16" type="image/png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />
      </head>
      <body>
        <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-6">
            <Link href="/" className="flex items-center">
              <Image src="/images/logos/CheapTravel_India_Logo_Transparent.png" alt="Cheap Travels India" width={170} height={48} priority style={{ height: 48, width: 'auto' }} />
            </Link>
            <nav className="hidden md:flex gap-6 text-sm font-medium text-gray-500">
              <Link href="/" className="text-brand-green font-semibold">Bus Tickets</Link>
              <a className="hover:text-brand-green">Train</a>
              <a className="hover:text-brand-green">Flights</a>
              <a className="hover:text-brand-green">My Bookings</a>
              <a className="hover:text-brand-green">Offers</a>
            </nav>
            <div className="ml-auto flex items-center gap-4 text-sm">
              <a href="https://wa.me/919696235500" target="_blank" rel="noopener noreferrer"
                className="hidden sm:flex items-center gap-1.5 text-brand-green-d font-semibold hover:text-brand-green transition-colors">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.126 1.532 5.858L.057 23.716a.5.5 0 0 0 .625.635l6.047-1.515A11.95 11.95 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.812 9.812 0 0 1-5.031-1.384l-.36-.214-3.731.934.989-3.617-.234-.372A9.82 9.82 0 0 1 2.182 12C2.182 6.565 6.565 2.182 12 2.182S21.818 6.565 21.818 12 17.435 21.818 12 21.818z"/></svg>
                Support
              </a>
            </div>
          </div>
        </header>

        <main>{children}</main>

        <footer className="bg-brand-green-d text-emerald-100 mt-16">
          <div className="max-w-7xl mx-auto px-4 py-10 grid md:grid-cols-4 gap-8">
            <div>
              <div className="bg-white inline-flex p-3 rounded-lg mb-3">
                <Image src="/images/logos/CheapTravel_India_Logo_Transparent.png" alt="Cheap Travels India" width={160} height={46} style={{ height: 46, width: 'auto' }} />
              </div>
              <p className="text-sm leading-relaxed text-emerald-100/90">
                India's affordable bus booking platform. Direct from operator. Up to 5% extra discount. WhatsApp ticket in 90 seconds.
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-3">Company</h4>
              <p className="text-sm space-y-1.5"><a className="block">About us</a><a className="block">Careers</a><a className="block">Contact</a></p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-3">Support</h4>
              <p className="text-sm space-y-1.5"><a className="block">Help centre</a><a className="block">Cancellation</a><a className="block">Refund policy</a><a className="block">Terms</a></p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-3">Connect</h4>
              <p className="text-sm space-y-1.5">
                ✉️ cheaptravels.in@gmail.com<br />
                📲 WhatsApp: +91 96962 35500
              </p>
            </div>
          </div>
          <div className="max-w-7xl mx-auto px-4 py-4 border-t border-emerald-900/50 text-xs flex justify-between flex-wrap gap-2">
            <div>© {new Date().getFullYear()} Cheap Travels India Pvt Ltd</div>
            <div>Made in India 🇮🇳 · Verified agent partners</div>
          </div>
        </footer>
      </body>
    </html>
  );
}
