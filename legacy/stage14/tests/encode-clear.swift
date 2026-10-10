import Foundation
import AppKit
import AVFoundation
import CoreVideo
import ImageIO

// Uses only installed macOS frameworks. Input frames are actual Chrome captures.
let folder=URL(fileURLWithPath:CommandLine.arguments[1])
let data=try Data(contentsOf:folder.appendingPathComponent("timeline.json"))
let timeline=try JSONSerialization.jsonObject(with:data) as! [String:Any]
let frames=timeline["frames"] as! [[String:Any]]
let subtitles=timeline["subtitles"] as! [[Any]]
let duration=timeline["duration"] as! Double
let sourceWidth=1920,sourceHeight=900

func label(_ text:String, y:CGFloat, size:CGFloat, color:NSColor, bold:Bool) {
 let paragraph=NSMutableParagraphStyle();paragraph.alignment = .center
 var font=NSFont(name:bold ? "AppleSDGothicNeo-SemiBold":"AppleSDGothicNeo-Regular",size:size) ?? NSFont.systemFont(ofSize:size)
 let measured=(text as NSString).size(withAttributes:[.font:font]).width
 if measured>1820 {font=NSFont(name:font.fontName,size:size*1820/measured) ?? font}
 let attrs:[NSAttributedString.Key:Any]=[.font:font,.foregroundColor:color,.paragraphStyle:paragraph]
 (text as NSString).draw(in:CGRect(x:40,y:y,width:1840,height:60),withAttributes:attrs)
}
func encode(_ final:Bool) throws {
 let trim=timeline["trim"] as? [String:Any] ?? [:]
 let trimStart=trim["start"] as? Double ?? 0,trimEnd=trim["end"] as? Double ?? 0
 let outputDuration=final ? duration:(timeline["rawDuration"] as? Double ?? duration)
 let height=final ? 1080:900
 let name=final ? "CLEAR-demo-subtitled.mp4":"CLEAR-original-recording.mp4"
 let url=folder.appendingPathComponent(name)
 guard !FileManager.default.fileExists(atPath:url.path) else {fatalError("OUTPUT_ALREADY_EXISTS")}
 let writer=try AVAssetWriter(outputURL:url,fileType:.mp4)
 let input=AVAssetWriterInput(mediaType:.video,outputSettings:[AVVideoCodecKey:AVVideoCodecType.h264,AVVideoWidthKey:1920,AVVideoHeightKey:height,AVVideoCompressionPropertiesKey:[AVVideoAverageBitRateKey:5_000_000,AVVideoExpectedSourceFrameRateKey:5,AVVideoMaxKeyFrameIntervalKey:30]])
 input.expectsMediaDataInRealTime=false
 let adaptor=AVAssetWriterInputPixelBufferAdaptor(assetWriterInput:input,sourcePixelBufferAttributes:[kCVPixelBufferPixelFormatTypeKey as String:kCVPixelFormatType_32ARGB,kCVPixelBufferWidthKey as String:1920,kCVPixelBufferHeightKey as String:height,kCVPixelBufferCGImageCompatibilityKey as String:true,kCVPixelBufferCGBitmapContextCompatibilityKey as String:true])
 writer.add(input);guard writer.startWriting() else {throw writer.error!};writer.startSession(atSourceTime:.zero)
 var count=0
 for frame in frames {
  let rawT=frame["t"] as! Double
  if final && rawT>=trimStart && rawT<trimEnd {continue}
  let t=final && rawT>=trimEnd ? rawT-(trimEnd-trimStart):rawT
  if t>=outputDuration {continue}
  while !input.isReadyForMoreMediaData {if writer.status == .failed {throw writer.error!};Thread.sleep(forTimeInterval:0.005)}
  try autoreleasepool {
   let path=folder.appendingPathComponent(frame["path"] as! String)
   guard let imageSource=CGImageSourceCreateWithURL(path as CFURL,nil),let image=CGImageSourceCreateImageAtIndex(imageSource,0,nil) else {fatalError("FRAME_DECODE_FAILED")}
   var optional:CVPixelBuffer?
   CVPixelBufferPoolCreatePixelBuffer(nil,adaptor.pixelBufferPool!,&optional)
   let buffer=optional!;CVPixelBufferLockBaseAddress(buffer,[])
   let context=CGContext(data:CVPixelBufferGetBaseAddress(buffer),width:1920,height:height,bitsPerComponent:8,bytesPerRow:CVPixelBufferGetBytesPerRow(buffer),space:CGColorSpaceCreateDeviceRGB(),bitmapInfo:CGImageAlphaInfo.noneSkipFirst.rawValue)!
   context.setFillColor(CGColor(red:0.06,green:0.08,blue:0.13,alpha:1));context.fill(CGRect(x:0,y:0,width:1920,height:height))
   context.draw(image,in:CGRect(x:0,y:final ? 180:0,width:sourceWidth,height:sourceHeight))
   if final {
    NSGraphicsContext.saveGraphicsState();NSGraphicsContext.current=NSGraphicsContext(cgContext:context,flipped:false)
    if let sub=subtitles.first(where:{t>=($0[0] as! Double)&&t<($0[1] as! Double)}) {
     label(sub[2] as! String,y:88,size:30,color:.white,bold:true)
     label(sub[3] as! String,y:33,size:24,color:NSColor(calibratedWhite:0.83,alpha:1),bold:false)
    }
    NSGraphicsContext.restoreGraphicsState()
   }
   CVPixelBufferUnlockBaseAddress(buffer,[])
   guard adaptor.append(buffer,withPresentationTime:CMTime(seconds:t,preferredTimescale:600)) else {throw writer.error!}
  }
  count+=1;if count%150==0{print("\(name): \(count) frames")}
 }
 writer.endSession(atSourceTime:CMTime(seconds:outputDuration,preferredTimescale:600));input.markAsFinished()
 let done=DispatchSemaphore(value:0);writer.finishWriting{done.signal()};done.wait()
 guard writer.status == .completed else {throw writer.error!}
 print("COMPLETED \(name) \(count) frames")
}
try encode(false)
try encode(true)
