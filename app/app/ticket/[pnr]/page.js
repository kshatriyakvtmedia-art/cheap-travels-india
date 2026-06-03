import { getOrderByPnr } from '@/lib/db.js';
import Image from 'next/image';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function TicketPage({ params }) {
  const order = await getOrderByPnr(params.pnr);
  if (!order) notFound();
  const route = `${order.from_city} → ${order.to_city}`;

  return (
    <div className="bg-brand-surface min-h-screen py-10 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-5 flex items-center gap-4 mb-5">
          <div className="w-14 h-14 rounded-full bg-emerald-600 text-white text-3xl flex items-center justify-center flex-shrink-0">✓</div>
          <div>
            <h3 className="font-head font-bold text-lg text-emerald-800">Booking confirmed · Ticket sent</h3>
            <p className="text-sm text-emerald-700">Your e-ticket has been pushed to WhatsApp and email. PNR: <b>{order.provider_pnr}</b></p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-card overflow-hidden border border-gray-200">
          <div className="text-white p-5 flex items-center justify-between" style={{ background: 'linear-gradient(135deg,#094B30,#0E7B4F)' }}>
            <div className="flex items-center gap-3">
              <div className="bg-white p-2 rounded-lg">
                <Image src="/images/logos/CheapTravel_India_Logo_Transparent.png" alt="Cheap Travels India" width={130} height={36} style={{ height: 36, width: 'auto' }} />
              </div>
              <div>
                <div className="font-bold text-sm">Verified E-Ticket</div>
                <div className="text-xs text-emerald-100">Powered by {order.operator}</div>
              </div>
            </div>
            <div className="bg-orange-100/20 border border-brand-orange px-3 py-1.5 rounded-lg font-bold tracking-widest text-sm">PNR · {order.provider_pnr}</div>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center pb-5 border-b border-dashed border-gray-200">
              <div>
                <div className="font-head font-extrabold text-xl text-brand-ink">{order.from_city}</div>
                <div className="text-brand-green-d font-bold text-sm mt-1">{order.departure} · {order.journey_date}</div>
                <div className="text-xs text-gray-500">{order.boarding_point}</div>
              </div>
              <div className="text-3xl text-brand-orange">→</div>
              <div className="text-right">
                <div className="font-head font-extrabold text-xl text-brand-ink">{order.to_city}</div>
                <div className="text-brand-green-d font-bold text-sm mt-1">{order.arrival}</div>
                <div className="text-xs text-gray-500">{order.dropping_point}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5">
              <Cell label="Passenger" value={`${order.passenger_name || '—'} · ${order.passenger_gender || ''} · ${order.passenger_age || ''}`} />
              <Cell label="Seat" value={order.seat_no} />
              <Cell label="Operator" value={order.operator} />
              <Cell label="Bus type" value={order.bus_type} />
              <Cell label="Booked on" value={(order.created_at || '').slice(0, 16)} />
              <Cell label="Amount paid" value={`₹${order.total_payable}`} cls="text-emerald-600" />
              <Cell label="Order ID" value={order.id} />
              <Cell label="Payment" value="UPI" />
            </div>

            <div className="grid md:grid-cols-2 gap-3 mt-5 pt-5 border-t border-dashed border-gray-200">
              <Point label="Boarding" name={order.boarding_point} time={order.departure}
                     hint="Report 20 min before departure. Carry valid Govt. ID." />
              <Point label="Dropping" name={order.dropping_point} time={order.arrival} hint="Est. time; subject to traffic." />
            </div>
          </div>

          <div className="bg-brand-surface border-t border-dashed border-gray-200 p-4 flex flex-wrap gap-2">
            <a href={`https://wa.me/?text=My%20PNR%20${order.provider_pnr}%20${encodeURIComponent(route)}`}
               className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-semibold">📲 Share to WhatsApp</a>
            <button className="px-4 py-2 rounded-lg bg-brand-green text-white text-sm font-semibold">✉️ Email me</button>
            <button onClick={() => window.print && window.print()} className="px-4 py-2 rounded-lg border border-brand-green text-brand-green text-sm font-semibold">🖨️ Print</button>
          </div>

          <div className="bg-brand-green-d text-emerald-100 px-5 py-3 text-xs flex justify-between flex-wrap gap-2">
            <span>Cheap Travels India · 24×7 helpline 1800-123-9999 · cheaptravels.in@gmail.com</span>
            <span>Auto-refund SLA: 30 min · ID required at boarding</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const Cell = ({ label, value, cls = '' }) => (
  <div>
    <div className="label">{label}</div>
    <div className={`text-sm font-bold ${cls}`}>{value}</div>
  </div>
);
const Point = ({ label, name, time, hint }) => (
  <div className="bg-brand-surface border border-gray-200 rounded-lg p-3">
    <div className="text-[11px] text-brand-green-d uppercase tracking-wider font-bold">{label}</div>
    <b className="text-sm block mt-0.5">{name} · {time}</b>
    <small className="text-xs text-gray-500">{hint}</small>
  </div>
);
