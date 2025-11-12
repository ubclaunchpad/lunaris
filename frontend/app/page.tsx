import Link from "next/link";

export default function Home() {
    return (
        <>
            <div>
                <Link href={"login"}>Log In</Link>
            </div>
            <div>
                <Link href={"streaming"}>Stream</Link>
            </div>
        </>
    );
}
