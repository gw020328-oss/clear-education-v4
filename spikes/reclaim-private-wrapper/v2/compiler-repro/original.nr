// Private parser component ONLY, not a signed Reclaim claim verifier.
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
    expected_date:[u8;10],expected_number:[u8;10],number_length:u32,expected_score:u32) {
    assert((length>0)&(length<=N)&(selected_row<16));
    let mut stack:[u32;16]=[0;16];let mut depth:u32=0;
    let mut state:u32=0;let mut code:u64=0;let mut name_len:u32=0;let mut html_quote:u8=0;
    let mut closing=false;let mut token_start:u32=0;let mut comment_phase:u32=0;let mut dash:u32=0;
    let mut tables:u32=0;let mut ended=false;let mut row_count:u32=0;let mut row:u32=0;
    let mut col:u32=0;let mut in_row=false;let mut in_cell=false;
    let mut headers:[bool;16]=[false;16];let mut counts:[u32;16]=[0;16];
    let mut starts:[u32;64]=[0;64];let mut ends:[u32;64]=[0;64];
    for i in 0..N {
      let c=html[i];
      if i>=length {assert(c==0);} else {
        assert((c!=42)&(c!=0)); // stock whole-table policy prohibits '*'
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
            assert(!closing);assert(!in_cell | headers[row] | (col>4));state=3;comment_phase=0;dash=0;
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
            if (id==6)|(id==7) {assert(in_cell);if col<=4 {ends[row*4+col-1]=token_start;}in_cell=false;}
            if id==5 {assert(in_row & (col>0));counts[row]=col;in_row=false;}
            if id==1 {ended=true;}
            depth-=1;
          } else {
            assert(!ended);
            if id==1 {assert((depth==0)&(tables==0));tables+=1;}
            else if (id==2)|(id==3)|(id==4)|(id==8) {assert(parent==1);}
            else if id==9 {assert(parent==8);}
            else if id==5 {
              assert(((parent==1)|(parent==2)|(parent==3)|(parent==4)) & !in_row & (row_count<16));
              row=row_count;row_count+=1;col=0;in_row=true;
            } else if (id==6)|(id==7) {
              assert((parent==5)&in_row & !in_cell & (col<12));
              if col==0 {headers[row]=id==7;} else {assert(headers[row]==(id==7));}
              col+=1;in_cell=true;if col<=4 {starts[row*4+col-1]=i+1;}
            } else {assert(in_cell & (headers[row]|(col>4)));}
            if (id!=9)&(id!=14)&(id!=15) {assert(depth<16);stack[depth]=id;depth+=1;}
          }
        }
      }
    }
    assert((state==0)&(depth==0)&ended&(tables==1)&(row_count>0));
    assert((selected_row<row_count)&!headers[selected_row]&(counts[selected_row]>=4));
    let mut values:[[u8;256];4]=[[0;256];4];let mut sizes:[u32;4]=[0;4];
    for j in 0..4 {
      let start=starts[selected_row*4+j];let end=ends[selected_row*4+j];
      assert((end>=start)&(end-start<=256));let mut first:u32=end;let mut last:u32=start;
      for k in 0..256 {if start+k<end {let b=html[start+k];assert((b!=38)&(b!=60)&(b!=62));if !ws(b){if first==end{first=start+k;}last=start+k+1;}}}
      assert(last>first);sizes[j]=last-first;
      for k in 0..256 {if k<sizes[j] {values[j][k]=html[first+k];}}
    }
    assert(sizes[0]==5);for j in 0..5 {assert(values[0][j]==[84,79,69,73,67][j]);}
    // Date bytes and field widths are bound here; calendar/policy/signature are separate integration gates.
    assert(sizes[1]==15);for j in 0..10 {assert(values[1][j]==expected_date[j]);}
    assert((values[1][10]==40)&(values[1][14]==41));
    assert((number_length>=6)&(number_length<=10)&(sizes[2]==number_length));
    for j in 0..10 {if j<number_length {assert((values[2][j]>=48)&(values[2][j]<=57));assert(values[2][j]==expected_number[j]);}else{assert(expected_number[j]==0);}}
    for j in 0..6 {assert(values[3][j]==[84,111,116,97,108,32][j]);}
    let mut score:u32=0;let mut digits:u32=0;let mut stopped=false;
    for j in 0..4 {let b=values[3][6+j];if !stopped {if (b>=48)&(b<=57){assert(digits<3);score=score*10+(b-48) as u32;digits+=1;}else{assert((b==32)&(values[3][7+j]==40));stopped=true;}}}
    assert(stopped&(digits>=2)&(score==expected_score)&(score>=10)&(score<=990)&(score%5==0));
}
