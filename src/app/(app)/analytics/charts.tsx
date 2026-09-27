"use client";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const COLORS = ["#2349C6", "#17754A", "#A86A12", "#B23A5B", "#5B6474", "#7A4CC2", "#1F5FA8", "#8FA3D9"];
type Datum = { name: string; value: number };

export function BarsChart({ data, label, horizontal }: { data: Datum[]; label: string; horizontal?: boolean }) {
  const height = horizontal ? Math.max(180, data.length * 34 + 30) : 240;
  return (
    <ResponsiveContainer width="100%" height={height}>
      {horizontal ? (
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
          <CartesianGrid horizontal={false} stroke="#DDE2EA" />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: "#5B6474" }} />
          <YAxis type="category" dataKey="name" width={170} tick={{ fontSize: 12, fill: "#3D4759" }} />
          <Tooltip cursor={{ fill: "#F6F7F9" }} />
          <Bar dataKey="value" name={label} fill="#2349C6" radius={[0, 3, 3, 0]} barSize={18} />
        </BarChart>
      ) : (
        <BarChart data={data} margin={{ left: -12, right: 12, top: 8, bottom: 4 }}>
          <CartesianGrid vertical={false} stroke="#DDE2EA" />
          <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#3D4759" }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#5B6474" }} />
          <Tooltip cursor={{ fill: "#F6F7F9" }} />
          <Bar dataKey="value" name={label} fill="#2349C6" radius={[3, 3, 0, 0]} barSize={36} />
        </BarChart>
      )}
    </ResponsiveContainer>
  );
}

export function DonutChart({ data }: { data: Datum[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={88} paddingAngle={1.5} stroke="#fff">
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip />
        <Legend verticalAlign="middle" align="right" layout="vertical" iconType="circle" wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
