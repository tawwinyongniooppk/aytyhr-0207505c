import React from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-6">
          <div className="text-center space-y-4 max-w-sm">
            <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-destructive/10 mx-auto">
              <AlertTriangle className="h-7 w-7 text-destructive" />
            </div>
            <h2 className="text-lg font-bold font-display">Something went wrong</h2>
            <p className="text-sm text-muted-foreground">{this.state.error?.message || "An unexpected error occurred."}</p>
            <Button onClick={() => { this.setState({ hasError: false, error: null }); window.location.href = "/dashboard"; }}>
              Back to Dashboard
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
