import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'USDT Batch Desk',icons:{icon:'/favicon.svg'},description:'Send USDT batches from any connected wallet on Ethereum.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
