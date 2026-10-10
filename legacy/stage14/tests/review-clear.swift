import Foundation
import AVFoundation
import AppKit
let folder=URL(fileURLWithPath:CommandLine.arguments[1])
let url=folder.appendingPathComponent("CLEAR-demo-subtitled.mp4")
let asset=AVURLAsset(url:url)
let tracks=asset.tracks(withMediaType:.video)
guard let track=tracks.first else {fatalError("NO_VIDEO_TRACK")}
let duration=CMTimeGetSeconds(asset.duration)
let reader=try AVAssetReader(asset:asset)
let output=AVAssetReaderTrackOutput(track:track,outputSettings:[kCVPixelBufferPixelFormatTypeKey as String:kCVPixelFormatType_32BGRA])
reader.add(output);guard reader.startReading() else {fatalError("READER_FAILED")}
var count=0,last=0.0,backward=false
while let sample=output.copyNextSampleBuffer(){let t=CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sample));if t<last{backward=true};last=t;count+=1}
guard reader.status == .completed else {fatalError("DECODE_FAILED")}
let qa=folder.appendingPathComponent("video-review",isDirectory:true)
try FileManager.default.createDirectory(at:qa,withIntermediateDirectories:true)
let generator=AVAssetImageGenerator(asset:asset);generator.appliesPreferredTrackTransform=true
generator.requestedTimeToleranceBefore = .zero;generator.requestedTimeToleranceAfter = CMTime(seconds:0.4,preferredTimescale:600)
var sheet:NSImage?=nil,index=0,sheets:[String]=[]
for second in stride(from:0,to:Int(duration),by:4){
 var actual=CMTime.zero
 let cg=try generator.copyCGImage(at:CMTime(seconds:Double(second)+0.2,preferredTimescale:600),actualTime:&actual)
 if index%4==0{sheet=NSImage(size:NSSize(width:1920,height:1140))}
 sheet!.lockFocus()
 let x=(index%2)*960,y=(1-(index%4)/2)*570
 NSColor.black.setFill();NSRect(x:x,y:y,width:960,height:570).fill()
 NSImage(cgImage:cg,size:NSSize(width:1920,height:1080)).draw(in:NSRect(x:x,y:y+30,width:960,height:540))
 (String(format:"%02d:%02d",second/60,second%60) as NSString).draw(at:NSPoint(x:x+15,y:y+5),withAttributes:[.font:NSFont.monospacedDigitSystemFont(ofSize:18,weight:.medium),.foregroundColor:NSColor.white])
 sheet!.unlockFocus()
 if index%4==3 || second+4>=Int(duration){let name=String(format:"contact-%02d.png",index/4);let bitmap=NSBitmapImageRep(data:sheet!.tiffRepresentation!)!;try bitmap.representation(using:.png,properties:[:])!.write(to:qa.appendingPathComponent(name),options:.withoutOverwriting);sheets.append(name)}
 index+=1
}
let report:[String:Any]=["durationSeconds":duration,"width":track.naturalSize.width,"height":track.naturalSize.height,"decodedFrames":count,"allFramesDecoded":true,"monotonicTimestamps": !backward,"lastFrameSeconds":last,"audioTracks":asset.tracks(withMediaType:.audio).count,"inspectionIntervalSeconds":4,"contactSheets":sheets,"underThreeMinutes":duration<=180,"atLeastTwoMinutesFortySeconds":duration>=160]
let json=try JSONSerialization.data(withJSONObject:report,options:[.prettyPrinted,.sortedKeys]);try json.write(to:folder.appendingPathComponent("video-validation.json"),options:.withoutOverwriting)
print(String(data:json,encoding:.utf8)!)
