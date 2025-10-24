"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AgencyRating } from "@/lib/types";
import { getRatingColor, getBucketColor, getOutlookIcon } from "@/lib/utils";
import { AlertCircle, CheckCircle2, ExternalLink, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { format } from "date-fns";

interface RatingCardProps {
  agency: string;
  rating: AgencyRating;
}

const agencyNames: Record<string, string> = {
  fitch: "Fitch Ratings",
  sp: "S&P Global",
  moodys: "Moody's",
};

const agencyLogos: Record<string, string> = {
  fitch: "🏢",
  sp: "📊",
  moodys: "📈",
};

export function RatingCard({ agency, rating }: RatingCardProps) {
  const hasRating = rating.raw && !rating.blocked && !rating.error;

  return (
    <Card className={hasRating ? "border-l-4 border-l-primary" : ""}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <span className="text-2xl">{agencyLogos[agency]}</span>
            {agencyNames[agency]}
          </CardTitle>
          {hasRating && (
            <CheckCircle2 className="h-5 w-5 text-green-600" />
          )}
          {rating.blocked && (
            <AlertCircle className="h-5 w-5 text-orange-600" />
          )}
          {rating.error && !rating.blocked && (
            <AlertCircle className="h-5 w-5 text-red-600" />
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {hasRating ? (
          <>
            {/* Rating Display */}
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-3xl font-bold">{rating.raw}</span>
                  {rating.outlook && (
                    <Badge variant="outline" className="text-xs">
                      {rating.outlook === "Positive" && <TrendingUp className="h-3 w-3 mr-1" />}
                      {rating.outlook === "Negative" && <TrendingDown className="h-3 w-3 mr-1" />}
                      {rating.outlook === "Stable" && <Minus className="h-3 w-3 mr-1" />}
                      {rating.outlook}
                    </Badge>
                  )}
                </div>
                {rating.normalized && (
                  <p className="text-sm text-muted-foreground">
                    Score: {rating.normalized.score}/21
                  </p>
                )}
              </div>

              {rating.normalized && (
                <Badge className={getBucketColor(rating.normalized.bucket)}>
                  {rating.normalized.bucket}
                </Badge>
              )}
            </div>

            {/* Metadata */}
            <div className="space-y-1 text-sm text-muted-foreground">
              {rating.last_updated && (
                <p>
                  Updated: {format(new Date(rating.last_updated), "MMM d, yyyy")}
                </p>
              )}
              {rating.source_url && (
                <a
                  href={rating.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-primary hover:underline"
                >
                  View source <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Error/Blocked State */}
            {rating.blocked && (
              <div className="space-y-2">
                <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                  Blocked
                </Badge>
                <p className="text-sm text-muted-foreground">{rating.error}</p>
              </div>
            )}
            {rating.error && !rating.blocked && (
              <div className="space-y-2">
                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                  Error
                </Badge>
                <p className="text-sm text-muted-foreground">{rating.error}</p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
