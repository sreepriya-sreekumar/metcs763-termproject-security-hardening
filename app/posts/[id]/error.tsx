"use client";
import { useEffect, useRef } from "react";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  const shown = useRef(false);

  useEffect(() => {
    if (!shown.current) {
      alert("An error occurred: " + error.message);
      shown.current = true;
    }
  }, [error]);

  return (
    <div className="p-8 text-center">
      <h1 className="text-2xl font-bold mb-4">Something went wrong</h1>
      <p>{error.message}</p>

      <button
        onClick={() => reset()}
        className="mt-4 px-4 py-2 bg-blue-600 text-white rounded"
      >
        Try again
      </button>
    </div>
  );
}
