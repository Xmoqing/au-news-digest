export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initNewsScheduler } = await import('@/lib/scheduler');
    initNewsScheduler();
  }
}
