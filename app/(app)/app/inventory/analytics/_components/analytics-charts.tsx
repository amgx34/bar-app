'use client';

import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { CategoryBreakdown, VelocityItem, TopValueItem, ShrinkageRow, MonthlyShrinkage, PourCostItem } from '../actions';

const PALETTE = ['#0d9488','#f59e0b','#10b981','#0ea5e9','#8b5cf6','#e11d48','#f97316','#84cc16','#ec4899'];
const tooltipStyle = { backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: 12 };
const tickStyle = { fontSize: 11, fill: 'hsl(var(--muted-foreground))' };
function fmtDollar(v: number) { return `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`; }

export function CategoryValuePie({ data }: { data: CategoryBreakdown[] }) {
  const chartData = data.filter((d) => d.totalValue > 0).slice(0, 8);
  if (chartData.length === 0) return <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">No data</div>;
  return (
    <div className="w-full h-56">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={chartData} dataKey="totalValue" nameKey="category" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2}>
            {chartData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [fmtDollar(v as number), name]} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} formatter={(value: string) => value.length > 14 ? value.slice(0, 13) + '…' : value} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function FastMoversChart({ data }: { data: VelocityItem[] }) {
  const chartData = data.map((d) => ({ name: d.name.length > 22 ? d.name.slice(0, 21) + '…' : d.name, value: parseFloat(d.dailyUsage.toFixed(2)) }));
  if (chartData.length === 0) return <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">No usage data in last 30 days</div>;
  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 40, left: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
          <XAxis type="number" tick={tickStyle} axisLine={false} tickLine={false} tickFormatter={(v: number) => v.toFixed(2)} />
          <YAxis type="category" dataKey="name" tick={tickStyle} axisLine={false} tickLine={false} width={130} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${(v as number).toFixed(3)} units/day`, 'Daily Usage']} />
          <Bar dataKey="value" name="Daily Usage" fill="#0d9488" radius={[0,4,4,0]} maxBarSize={20} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TopValueChart({ data }: { data: TopValueItem[] }) {
  const chartData = data.map((d) => ({ name: d.name.length > 22 ? d.name.slice(0, 21) + '…' : d.name, value: parseFloat(d.stockValue.toFixed(2)) }));
  if (chartData.length === 0) return <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">No cost data available</div>;
  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 60, left: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
          <XAxis type="number" tick={tickStyle} axisLine={false} tickLine={false} tickFormatter={fmtDollar} />
          <YAxis type="category" dataKey="name" tick={tickStyle} axisLine={false} tickLine={false} width={130} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => [fmtDollar(v as number), 'Stock Value']} />
          <Bar dataKey="value" name="Stock Value" fill="#f59e0b" radius={[0,4,4,0]} maxBarSize={20} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ShrinkagePie({ data }: { data: ShrinkageRow[] }) {
  if (data.length === 0) return <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">No shrinkage recorded</div>;
  return (
    <div className="w-full h-52">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="estimatedCost" nameKey="reason" cx="50%" cy="50%" outerRadius={75} paddingAngle={3}>
            {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [fmtDollar(v as number), name]} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MonthlyShrinkageChart({ data }: { data: MonthlyShrinkage[] }) {
  if (data.length === 0) return <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">No shrinkage data</div>;
  return (
    <div className="w-full h-52">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="month" tick={tickStyle} axisLine={false} tickLine={false} />
          <YAxis tick={tickStyle} axisLine={false} tickLine={false} tickFormatter={fmtDollar} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [name === 'estimatedCost' ? fmtDollar(v as number) : `${(v as number).toFixed(2)} units`, name === 'estimatedCost' ? 'Est. Cost' : 'Quantity']} />
          <Bar dataKey="estimatedCost" name="Est. Cost" fill="#e11d48" radius={[3,3,0,0]} maxBarSize={40} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PourCostChart({ data }: { data: PourCostItem[] }) {
  const chartData = data.map((d) => ({ name: d.name.length > 22 ? d.name.slice(0, 21) + '…' : d.name, costPerPour: parseFloat(d.costPerPour.toFixed(3)) }));
  if (chartData.length === 0) return <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">No items with bottle + pour data. Add bottle size and pour size to your liquor inventory.</div>;
  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 60, left: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
          <XAxis type="number" tick={tickStyle} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${v.toFixed(2)}`} />
          <YAxis type="category" dataKey="name" tick={tickStyle} axisLine={false} tickLine={false} width={130} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`$${(v as number).toFixed(3)}`, 'Cost / Pour']} />
          <Bar dataKey="costPerPour" name="Cost / Pour" fill="#8b5cf6" radius={[0,4,4,0]} maxBarSize={20} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
