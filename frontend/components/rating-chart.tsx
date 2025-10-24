"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface RatingChartProps {
  ratings: {
    fitch?: { normalized?: number; rating?: string };
    sp?: { normalized?: number; rating?: string };
    moodys?: { normalized?: number; rating?: string };
  };
}

export function RatingChart({ ratings }: RatingChartProps) {
  const data = [
    {
      name: "Fitch",
      value: ratings.fitch?.normalized || 0,
      rating: ratings.fitch?.rating || "N/A"
    },
    {
      name: "S&P",
      value: ratings.sp?.normalized || 0,
      rating: ratings.sp?.rating || "N/A"
    },
    {
      name: "Moody's",
      value: ratings.moodys?.normalized || 0,
      rating: ratings.moodys?.rating || "N/A"
    },
  ].filter(item => item.value > 0);

  const getColor = (value: number) => {
    if (value <= 4) return "#16a34a";
    if (value <= 7) return "#2563eb";
    if (value <= 10) return "#ca8a04";
    if (value <= 16) return "#ea580c";
    return "#dc2626";
  };

  if (data.length === 0) {
    return null;
  }

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload[0]) {
      return (
        <div className="bg-card p-3 rounded-lg border shadow-lg">
          <p className="font-semibold">{payload[0].payload.name}</p>
          <p className="text-sm text-muted-foreground">
            Rating: <span className="font-medium text-foreground">{payload[0].payload.rating}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            Score: <span className="font-medium text-foreground">{payload[0].value}/21</span>
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Rating Comparison</span>
          <span className="text-sm font-normal text-muted-foreground">
            Lower score = Better rating
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted opacity-30" />
            <XAxis
              dataKey="name"
              className="text-sm"
              tick={{ fill: 'hsl(var(--foreground))' }}
            />
            <YAxis
              domain={[0, 21]}
              className="text-sm"
              tick={{ fill: 'hsl(var(--foreground))' }}
              label={{
                value: 'Risk Score',
                angle: -90,
                position: 'insideLeft',
                style: { fill: 'hsl(var(--muted-foreground))', fontSize: '12px' }
              }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="value" radius={[8, 8, 0, 0]} maxBarSize={100}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getColor(entry.value)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}