"use client";

import { RatingsResponse } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RatingCard } from "./rating-card";
import { Building2, Globe, AlertTriangle, Clock, Database } from "lucide-react";
import { format } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface RatingsResultsProps {
  data: RatingsResponse;
}

export function RatingsResults({ data }: RatingsResultsProps) {
  // Prepare chart data
  const chartData = Object.entries(data.ratings)
    .filter(([_, rating]) => rating.normalized)
    .map(([agency, rating]) => ({
      agency: agency.toUpperCase(),
      score: rating.normalized!.score,
      rating: rating.raw,
    }));

  const hasAnyRating = Object.values(data.ratings).some((r) => r.raw);

  return (
    <div className="space-y-6">
      {/* Entity Info */}
      {data.resolved && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Resolved Entity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <h3 className="text-xl font-semibold">{data.resolved.name}</h3>
                {data.resolved.country && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Globe className="h-4 w-4" />
                    {data.resolved.country}
                  </p>
                )}
              </div>
              <Badge
                variant={data.resolved.confidence >= 0.8 ? "default" : "secondary"}
                className="text-xs"
              >
                {(data.resolved.confidence * 100).toFixed(0)}% confidence
              </Badge>
            </div>

            {data.resolved.canonical_url && (
              <a
                href={data.resolved.canonical_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline"
              >
                {data.resolved.canonical_url}
              </a>
            )}

            {data.resolved.ambiguous_candidates.length > 0 && (
              <div className="mt-3 p-3 bg-muted rounded-md">
                <p className="text-sm font-medium mb-2">Alternative matches found:</p>
                <ul className="space-y-1">
                  {data.resolved.ambiguous_candidates.map((candidate, idx) => (
                    <li key={idx} className="text-xs text-muted-foreground">
                      {candidate.name} ({(candidate.confidence * 100).toFixed(0)}%)
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Comparison Chart */}
      {hasAnyRating && chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Rating Comparison</CardTitle>
            <CardDescription>
              Lower score is better (1 = AAA/Aaa, 21 = Default)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="agency" />
                <YAxis reversed domain={[0, 21]} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-background border rounded-md p-2 shadow-md">
                          <p className="font-semibold">{payload[0].payload.agency}</p>
                          <p className="text-sm">Rating: {payload[0].payload.rating}</p>
                          <p className="text-sm">Score: {payload[0].value}/21</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend />
                <Bar dataKey="score" fill="hsl(var(--primary))" name="Rating Score" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Rating Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {Object.entries(data.ratings).map(([agency, rating]) => (
          <RatingCard key={agency} agency={agency} rating={rating} />
        ))}
      </div>

      {/* Notes */}
      {data.notes.length > 0 && (
        <Card className="border-orange-200 bg-orange-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-900">
              <AlertTriangle className="h-5 w-5" />
              Notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {data.notes.map((note, idx) => (
                <li key={idx} className="text-sm text-orange-800">
                  • {note}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Metadata */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {format(new Date(data.timestamp), "PPpp")}
          </span>
          {data.cached && (
            <Badge variant="outline" className="text-xs">
              <Database className="h-3 w-3 mr-1" />
              Cached
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}
