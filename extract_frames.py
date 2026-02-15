
import cv2
import os
import json

def extract_frames(video_path, output_dir):
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"Error: Could not open video file {video_path}")
        return

    frame_count = 0
    frames_list = []
    
    while True:
        ret, frame = cap.read()
        if not ret:
            break
            
        frame_count += 1
        frame_filename = f"frame_{frame_count:05d}.png"
        output_path = os.path.join(output_dir, frame_filename)
        
        # Save frame as PNG
        cv2.imwrite(output_path, frame)
        frames_list.append(f"images_2/{frame_filename}")
        
    cap.release()
    print(f"Extracted {frame_count} frames to {output_dir}")
    
    # Create manifest
    with open('frames-manifest_2.json', 'w') as f:
        json.dump(frames_list, f)
    print("Created frames-manifest_2.json")

if __name__ == "__main__":
    extract_frames('protein_2.mp4', 'images_2')
