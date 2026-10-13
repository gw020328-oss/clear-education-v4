// Synthetic diagnostic host only. Production needs signed distribution,
// durable recovery and ancestor/handle validation before using real credentials.
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
public static class ClearSpikeJob {
  [StructLayout(LayoutKind.Sequential)] struct BasicLimits { public long perProcess,perJob; public uint flags; public UIntPtr min,max; public uint active; public UIntPtr affinity; public uint priority,scheduling; }
  [StructLayout(LayoutKind.Sequential)] struct IoCounters { public ulong a,b,c,d,e,f; }
  [StructLayout(LayoutKind.Sequential)] struct ExtendedLimits { public BasicLimits basic; public IoCounters io; public UIntPtr processMemory,jobMemory,peakProcess,peakJob; }
  [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct StartupInfo { public uint cb; public string reserved,desktop,title; public uint x,y,xSize,ySize,xChars,yChars,fill,flags; public ushort show,reserved2; public IntPtr bytes,stdin,stdout,stderr; }
  [StructLayout(LayoutKind.Sequential)] struct ProcessInfo { public IntPtr process,thread; public uint pid,tid; }
  [StructLayout(LayoutKind.Sequential)] struct Accounting { public long a,b,c,d; public uint faults,total,active,terminated; }
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr attr,string name);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job,int kind,ref ExtendedLimits info,uint length);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcess(string app,StringBuilder command,IntPtr processAttr,IntPtr threadAttr,bool inherit,uint flags,IntPtr environment,string cwd,ref StartupInfo startup,out ProcessInfo process);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool TerminateJobObject(IntPtr job,uint code);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool QueryInformationJobObject(IntPtr job,int kind,out Accounting info,uint length,IntPtr returned);
  [DllImport("kernel32.dll",SetLastError=true)] static extern uint ResumeThread(IntPtr thread);
  [DllImport("kernel32.dll",SetLastError=true)] static extern uint WaitForSingleObject(IntPtr handle,uint ms);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr process,out uint code);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool TerminateProcess(IntPtr process,uint code);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool CloseHandle(IntPtr handle);
  static string Quote(string arg) {
    var b=new StringBuilder("\""); int slashes=0;
    foreach(char c in arg) { if(c=='\\') { slashes++; continue; } if(c=='\"')b.Append('\\',slashes*2+1); else b.Append('\\',slashes); b.Append(c); slashes=0; }
    b.Append('\\',slashes*2); return b.Append('"').ToString();
  }
  public static int Run(string exe,string[] args,string cwd,int timeoutMs) {
    IntPtr job=CreateJobObject(IntPtr.Zero,null);if(job==IntPtr.Zero)throw new Win32Exception();
    ProcessInfo pi=new ProcessInfo();bool assigned=false;
    try {
      var limits=new ExtendedLimits();limits.basic.flags=0x2000; // KILL_ON_JOB_CLOSE; no breakaway
      if(!SetInformationJobObject(job,9,ref limits,(uint)Marshal.SizeOf(typeof(ExtendedLimits))))throw new Win32Exception();
      var command=new StringBuilder(Quote(exe));foreach(string arg in args)command.Append(' ').Append(Quote(arg));
      var si=new StartupInfo();si.cb=(uint)Marshal.SizeOf(typeof(StartupInfo));
      if(!CreateProcess(exe,command,IntPtr.Zero,IntPtr.Zero,false,4,IntPtr.Zero,cwd,ref si,out pi))throw new Win32Exception(); // CREATE_SUSPENDED
      if(!AssignProcessToJobObject(job,pi.process))throw new Win32Exception();assigned=true;
      if(ResumeThread(pi.thread)==0xFFFFFFFF)throw new Win32Exception();
      uint wait=WaitForSingleObject(pi.process,(uint)timeoutMs);
      if(wait==258)return 124;
      if(wait!=0)throw new Win32Exception();
      uint code;if(!GetExitCodeProcess(pi.process,out code))throw new Win32Exception();return (int)code;
    } finally {
      if(pi.process!=IntPtr.Zero&&!assigned)TerminateProcess(pi.process,125);
      bool treeStopped=true;
      if(assigned) {
        treeStopped=TerminateJobObject(job,0);
        if(treeStopped) {
          treeStopped=false;
          for(int attempt=0;attempt<100;attempt++) {
            Accounting info;
            if(!QueryInformationJobObject(job,1,out info,(uint)Marshal.SizeOf(typeof(Accounting)),IntPtr.Zero))break;
            if(info.active==0){treeStopped=true;break;}
            System.Threading.Thread.Sleep(50);
          }
        }
      }
      CloseHandle(job);
      if(pi.thread!=IntPtr.Zero)CloseHandle(pi.thread);
      if(pi.process!=IntPtr.Zero) {
        uint stopped=WaitForSingleObject(pi.process,5000);CloseHandle(pi.process);
        if(stopped!=0)throw new InvalidOperationException("JOB_CLEANUP_NOT_CONFIRMED");
      }
      if(!treeStopped)throw new InvalidOperationException("JOB_TREE_CLEANUP_NOT_CONFIRMED");
    }
  }
}
