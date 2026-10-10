import React from "react";

/**
 * Standalone food card.
 *
 * The student dashboard renders its own richer card inline (with stock
 * awareness and cart state); this exported version is the simple shared
 * variant for other surfaces.
 */
export default function FoodCard({ food, onDelete }) {
  return (
    <div className="bg-white rounded-2xl shadow-soft p-4 w-60 m-2 flex flex-col items-center">
      <img
        className="rounded-xl w-full h-36 object-cover mb-3"
        src={food.image || "/placeholder-food.svg"}
        alt={food.name}
      />
      <h3 className="font-bold text-lg text-ink">{food.name}</h3>
      <p className="text-sm text-ink-mute text-center">{food.description}</p>
      <p className="text-brand-600 font-extrabold mt-1">₹{food.price}</p>
      {onDelete && (
        <button
          className="mt-3 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold py-1 px-3 rounded-full"
          onClick={() => onDelete(food._id)}
        >
          Delete
        </button>
      )}
    </div>
  );
}
