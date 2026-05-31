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
        <link rel="icon" href="/Logo.png" />
      </head>
      <body>
        <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-6">
            <Link href="/" className="flex items-center">
              <Image src="/Logo.png" alt="Cheap Travels India" width={170} height={48} priority style={{ height: 48, width: 'auto' }} />
            </Link>
            <nav className="hidden md:flex gap-6 text-sm font-medium text-gray-500">
              <Link href="/" className="text-brand-green font-semibold">Bus Tickets</Link>
              <a className="hover:text-brand-green">Train</a>
              <a className="hover:text-brand-green">Flights</a>
              <a className="hover:text-brand-green">My Bookings</a>
              <a className="hover:text-brand-green">Offers</a>
            </nav>
            <div className="ml-auto flex items-center gap-4 text-sm">
              <span className="hidden sm:flex items-center gap-1.5 text-brand-green-d font-semibold">📞 1800-123-9999</span>
              <a href="/admin" className="btn-secondary text-xs">Admin</a>
            </div>
          </div>
        </header>

        <main>{children}</main>

        <footer className="bg-brand-green-d text-emerald-100 mt-16">
          <div className="max-w-7xl mx-auto px-4 py-10 grid md:grid-cols-4 gap-8">
            <div>
              <div className="bg-white inline-flex p-3 rounded-lg mb-3">
                <Image src="/Logo.png" alt="Cheap Travels India" width={160} height={46} style={{ height: 46, width: 'auto' }} />
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
                📞 1800-123-9999<br />
                ✉️ support@cheaptravels.in<br />
                📲 WhatsApp: +91 99999 99999
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
