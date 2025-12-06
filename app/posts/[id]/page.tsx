export const dynamic = "force-dynamic"; // This disables SSG and ISR

import crypto from "node:crypto";
import prisma from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";

export default async function Post({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  const postId = Number.parseInt(id);

  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: {
      author: true,
    },
  });

  if (!post) {
    notFound();
  }

  // generate a short-lived HMAC token only for the post owner
  const deleteTokenSecret = process.env.DELETE_TOKEN_SECRET || process.env.AUTH_SECRET;
  if (!deleteTokenSecret) {
    throw new Error("Missing DELETE_TOKEN_SECRET");
  }

  const session = await getServerSession(authOptions);
  let deleteToken: string | null = null;
  if (session?.user?.id && String(session.user.id) === String(post.authorId)) {
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = `${postId}:${session.user.id}:${timestamp}`;
    const signature = crypto.createHmac("sha256", deleteTokenSecret).update(payload).digest("hex");
    // token format: "<ts>:<sig>"
    deleteToken = `${timestamp}:${signature}`;
  }

  // Server action to delete the post (verifies session, HMAC token, timestamp, and ownership)
  async function deletePost(formData: FormData) {
    "use server";

    // require session
    const srvSession = await getServerSession(authOptions);
    if (!srvSession?.user) {
      console.log("Unauthorized: No session");
      throw new Error("Unauthorized");
    }

    // recompute secret inside action (do NOT rely on outer-scope capture)
    const deleteTokenSecret = process.env.DELETE_TOKEN_SECRET || process.env.AUTH_SECRET;
    if (!deleteTokenSecret) {
      console.log("Server error: Missing DELETE_TOKEN_SECRET");
      throw new Error("Missing DELETE_TOKEN_SECRET");
    }

    // require token
    const tokenEntry = formData.get("deleteToken");
    if (!tokenEntry) {
      console.log("Bad request: Missing token");
      throw new Error("Missing token");
    }

    // Safely handle FormDataEntryValue (string | File/Blob).
    let rawToken: string;

    if (typeof tokenEntry === "string") {
      rawToken = tokenEntry;
    } else if (tokenEntry instanceof Blob) {
      // File/Blob-like entry: read its text content
      rawToken = await tokenEntry.text();
    } else {
      console.log("Bad request: Unsupported token entry type");
      throw new Error("Malformed token");
    }


    const parts = rawToken.split(":");
    if (parts.length !== 2) {
      console.log("Bad request: Malformed token");
      throw new Error("Malformed token");
    }
    const [tsStr, sig] = parts;
    const ts = Number.parseInt(tsStr, 10);
    if (Number.isNaN(ts) || !sig) {
      console.log("Bad request: Malformed token");
      throw new Error("Malformed token");
    }

    // check token age (short-lived, e.g., 5 minutes)
    const now = Math.floor(Date.now() / 1000);
    const MAX_AGE = 60 * 5; // 5 minutes
    if (ts > now || Math.abs(now - ts) > MAX_AGE) {
      console.log("Bad request: Token expired");
      throw new Error("Token expired");
    }

    // recompute expected HMAC for bound values {postId, userId, timestamp}
    const expectedPayload = `${postId}:${srvSession.user.id}:${ts}`;
    const expectedSig = crypto.createHmac("sha256", deleteTokenSecret).update(expectedPayload).digest("hex");

    // constant-time compare
    let sigBuf: Buffer;
    let expectedBuf: Buffer;
    try {
      sigBuf = Buffer.from(sig, "hex");
      expectedBuf = Buffer.from(expectedSig, "hex");
    } catch {
      console.log("Bad request: Invalid token format");
      throw new Error("Invalid token format");
    }
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      console.log("Bad request: Invalid token signature");
      throw new Error("Invalid token signature");
    }

    // re-check ownership server-side before delete
    const existing = await prisma.post.findUnique({ where: { id: postId } });
    if (!existing) {
      notFound();
    }
    if (String(existing.authorId) !== String(srvSession.user.id)) {
      throw new Error("Forbidden");
    }

    await prisma.post.delete({
      where: {
        id: postId,
      },
    });

    redirect("/posts");
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-8">
      <article className="max-w-3xl w-full bg-white shadow-lg rounded-lg p-8">
        {/* Post Title */}
        <h1 className="text-5xl font-extrabold text-gray-900 mb-4">
          {post.title}
        </h1>

        {/* Author Information */}
        <p className="text-lg text-gray-600 mb-4">
          by <span className="font-medium text-gray-800">{post.author?.name || "Anonymous"}</span>
        </p>

        {/* Content Section */}
        <div className="text-lg text-gray-800 leading-relaxed space-y-6 border-t pt-6">
          {post.content ? (
            <p>{post.content}</p>
          ) : (
            <p className="italic text-gray-500">No content available for this post.</p>
          )}
        </div>
      </article>

      {/* Delete Button (only shown for owner; includes HMAC token) */}
      {deleteToken ? (
        <form action={deletePost} className="mt-6">
          <input type="hidden" name="deleteToken" value={deleteToken} />
          <button
            type="submit"
            className="px-6 py-3 bg-red-500 text-white font-semibold rounded-lg hover:bg-red-600 transition-colors"
          >
            Delete Post
          </button>
        </form>
      ) : null}
    </div>
  );
}
