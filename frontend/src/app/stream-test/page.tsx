import RealtimeProfile from '@/components/RealtimeProfile';

export default function StreamTestPage() {
    return (
        <main className="min-h-screen bg-neutral-950 text-white p-8">
            <div className="max-w-4xl mx-auto">
                <h1 className="text-3xl font-bold mb-6">SSE Streaming Test</h1>
                <p className="text-neutral-400 mb-8">
                    Upload a PDF to test the real-time streaming profile extraction.
                </p>
                <RealtimeProfile />
            </div>
        </main>
    );
}
