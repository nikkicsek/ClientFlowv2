import { useQuery } from "@tanstack/react-query";

export default function AuthDiagPage() {
  const { data: diagData, isLoading } = useQuery({
    queryKey: ["/debug/auth/diag"],
    retry: false,
  });

  if (isLoading) return <div>Loading diagnostics...</div>;

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Auth Diagnostics</h1>
      <pre className="bg-gray-100 p-4 rounded">
        {JSON.stringify(diagData, null, 2)}
      </pre>
    </div>
  );
}