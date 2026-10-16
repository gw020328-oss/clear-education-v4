// Private parser component ONLY, not a signed Reclaim claim verifier.
// Compact extraction: untrusted trim hints are checked against parser-derived cells.
// No variable-index reads from the large HTML array; all bytes still scan.
// All original HTML bytes stay private. Lowercase tags, balanced structure,
// bounded attributes/comments and plain first four data cells. Unknown tags reject.
global N:u32=2048;
fn ws(c:u8)->bool {(c==32)|(c==9)|(c==10)|(c==13)}
fn tag_id(code:u64)->u32 {
    if code==0x7461626c65 {1} else if code==0x7468656164 {2}
    else if code==0x74626f6479 {3} else if code==0x74666f6f74 {4}
    else if code==0x7472 {5} else if code==0x7464 {6} else if code==0x7468 {7}
    else if code==0x636f6c67726f7570 {8} else if code==0x636f6c {9}
    else if code==0x61 {10} else if code==0x7370616e {11} else if code==0x7374726f6e67 {12}
    else if code==0x62 {13} else if code==0x6272 {14} else if code==0x696e707574 {15}
    else if code==0x627574746f6e {16} else if code==0x646976 {17} else {0}
}
fn main(html:[u8;N], length:u32, selected_row:u32,
    expected_date:[u8;10],expected_number:[u8;10],number_length:u32,expected_score:u32,
    trim_starts:[u32;4],trim_ends:[u32;4],weekday:[u8;3]) {
    assert((length>0)&(length<=N)&(selected_row<16));
    let mut stack:[u32;16]=[0;16];let mut depth:u32=0;
    let mut state:u32=0;let mut code:u64=0;let mut name_len:u32=0;let mut html_quote:u8=0;
    let mut closing=false;let mut token_start:u32=0;let mut comment_phase:u32=0;let mut dash:u32=0;
    let mut utf_left:u32=0;let mut utf_min:u8=128;let mut utf_max:u8=191;
    let mut tables:u32=0;let mut ended=false;let mut row_count:u32=0;let mut row:u32=0;
    let mut col:u32=0;let mut in_row=false;let mut in_cell=false;
    let mut header=false;let mut selected_ok=false;let mut cell_start:u32=0;
    let mut starts:[u32;4]=[0;4];let mut ends:[u32;4]=[0;4];
    for i in 0..N {
      let c=html[i];
      if i>=length {assert(c==0);} else {
        assert((c!=42)&((c>=32)|ws(c))); // no redaction or control bytes
        // Validate the exact private UTF-8 stream, including headers and attributes.
        if utf_left>0 {assert((c>=utf_min)&(c<=utf_max));utf_left-=1;utf_min=128;utf_max=191;}
        else if c>=128 {
          if (c>=194)&(c<=223) {utf_left=1;}
          else if (c>=224)&(c<=239) {utf_left=2;if c==224 {utf_min=160;}if c==237 {utf_max=159;}}
          else {assert((c>=240)&(c<=244));utf_left=3;if c==240 {utf_min=144;}if c==244 {utf_max=143;}}
        }
        let mut finish=false;
        if state==0 {
          if c==60 {state=1;code=0;name_len=0;closing=false;html_quote=0;token_start=i;}
          else {if !in_cell {assert(ws(c));}}
        } else if state==3 {
          // Exact <!-- prefix then a comment ending -->, never interpreted as cells.
          if comment_phase<2 {assert(c==45);comment_phase+=1;}
          else {
            if c==45 {dash+=1;assert(dash<=2);}
            else if (c==62)&(dash==2) {state=0;dash=0;}
            else {assert(dash<2);dash=0;}
          }
        } else {
          assert(i-token_start<512);
          if (state==1)&(name_len==0)&(c==33) {
            assert(!closing);assert(!in_cell | header | (col>4));state=3;comment_phase=0;dash=0;
          } else if (state==1)&(name_len==0)&(c==47) {assert(!closing);closing=true;}
          else if (state==1)&(c>=97)&(c<=122) {assert(name_len<8);code=code*256+c as u64;name_len+=1;}
          else if state==1 {assert(name_len>0);assert(ws(c)|(c==62));state=2;finish=c==62;}
          else if state==2 {
            assert(c!=60);
            if closing {assert(ws(c)|(c==62));finish=c==62;}
            else if html_quote!=0 {if c==html_quote {html_quote=0;}}
            else if (c==34)|(c==39) {html_quote=c;}
            else if c==62 {finish=true;}
          }
        }
        if finish {
          state=0;let id=tag_id(code);assert(id!=0);
          let parent=if depth==0 {0} else {stack[depth-1]};
          if closing {
            assert((depth>0)&(parent==id));
            if (id==6)|(id==7) {assert(in_cell);assert(token_start-cell_start<=256);if (row==selected_row)&(col<=4) {ends[col-1]=token_start;}in_cell=false;}
            if id==5 {assert(in_row & (col>0));if row==selected_row {selected_ok=!header&(col>=4);}in_row=false;}
            if id==1 {ended=true;}
            depth-=1;
          } else {
            assert(!ended);
            if id==1 {assert((depth==0)&(tables==0));tables+=1;}
            else if (id==2)|(id==3)|(id==4)|(id==8) {assert(parent==1);}
            else if id==9 {assert(parent==8);}
            else if id==5 {
              assert(((parent==1)|(parent==2)|(parent==3)|(parent==4)) & !in_row & (row_count<16));
              row=row_count;row_count+=1;col=0;header=false;in_row=true;
            } else if (id==6)|(id==7) {
              assert((parent==5)&in_row & !in_cell & (col<12));
              if col==0 {header=id==7;} else {assert(header==(id==7));}
              col+=1;in_cell=true;cell_start=i+1;if (row==selected_row)&(col<=4) {starts[col-1]=i+1;}
            } else {assert(in_cell & (header|(col>4)));}
            if (id!=9)&(id!=14)&(id!=15) {assert(depth<16);stack[depth]=id;depth+=1;}
          }
        }
      }
    }
    assert((utf_left==0)&(state==0)&(depth==0)&ended&(tables==1)&(row_count>0));
    assert((selected_row<row_count)&selected_ok);
    let weekdays:[[u8;3];7]=[[236,155,148],[237,153,148],[236,136,152],[235,170,169],[234,184,136],[237,134,160],[236,157,188]];
    let mut weekday_ok=false;for j in 0..7 {weekday_ok=weekday_ok|((weekday[0]==weekdays[j][0])&(weekday[1]==weekdays[j][1])&(weekday[2]==weekdays[j][2]));}assert(weekday_ok);
    assert(((expected_date[4]==46)|(expected_date[4]==45))&(expected_date[7]==expected_date[4]));
    let mut y:u32=0;let mut m:u32=0;let mut d:u32=0;
    for j in 0..10 {if (j!=4)&(j!=7) {let b=expected_date[j];assert((b>=48)&(b<=57));let n=(b-48) as u32;if j<4 {y=y*10+n;}else if j<7 {m=m*10+n;}else{d=d*10+n;}}}
    let leap=(y%4==0)&((y%100!=0)|(y%400==0));
    let max_day=if m==2 {if leap {29}else{28}}else if (m==4)|(m==6)|(m==9)|(m==11){30}else{31};
    assert((m>=1)&(m<=12)&(d>=1)&(d<=max_day));
    assert((number_length>=6)&(number_length<=10));
    assert((expected_score>=10)&(expected_score<=990)&(expected_score%5==0));
    let digits=if expected_score>=100 {3} else {2};
    let mut expected:[[u8;16];4]=[[0;16];4];
    for j in 0..5 {expected[0][j]=[84,79,69,73,67][j];}
    for j in 0..10 {expected[1][j]=expected_date[j];}
    expected[1][10]=40;expected[1][14]=41;
    for j in 0..3 {expected[1][11+j]=weekday[j];}
    for j in 0..10 {if j<number_length {assert((expected_number[j]>=48)&(expected_number[j]<=57));expected[2][j]=expected_number[j];}else{assert(expected_number[j]==0);}}
    for j in 0..6 {expected[3][j]=[84,111,116,97,108,32][j];}
    if digits==3 {expected[3][6]=(expected_score/100) as u8+48;expected[3][7]=((expected_score/10)%10) as u8+48;expected[3][8]=(expected_score%10) as u8+48;}
    else {expected[3][6]=(expected_score/10) as u8+48;expected[3][7]=(expected_score%10) as u8+48;}
    expected[3][6+digits]=32;expected[3][7+digits]=40;
    let lengths:[u32;4]=[5,15,number_length,8+digits];
    for j in 0..4 {
      assert((starts[j]<=trim_starts[j])&(trim_starts[j]<trim_ends[j])&(trim_ends[j]<=ends[j]));
      if j<3 {assert(trim_ends[j]-trim_starts[j]==lengths[j]);}
      else {assert(trim_ends[j]-trim_starts[j]>=lengths[j]);}
    }
    // Fixed-index byte reads: hints cannot hide non-whitespace, splice cells,
    // truncate a fact, or substitute a different source byte.
    for i in 0..N {let b=html[i];for j in 0..4 {
      if (i>=starts[j])&(i<ends[j]) {
        assert((b!=38)&(b!=60)&(b!=62));
        if (i<trim_starts[j])|(i>=trim_ends[j]) {assert(ws(b));}
        else {
          if (i==trim_starts[j])|(i+1==trim_ends[j]) {assert(!ws(b));}
          let k=i-trim_starts[j];if k<lengths[j] {assert(b==expected[j][k]);}
        }
      }
    }}
}
